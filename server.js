// MorphAI - Backend Completo
// Node.js + Express + Replicate AI + Stripe + Mercado Pago

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Replicate = require('replicate');
const Stripe = require('stripe');
const MercadoPago = require('mercadopago');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// CONFIGURAÇÃO
// =====================
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
MercadoPago.configure({ access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN });

// Banco de dados simples (em produção: use PostgreSQL/MongoDB)
const db = {
  users: [],      // { id, email, password, plan, createdAt, credits }
  payments: []    // { id, userId, plan, amount, status, createdAt }
};

// =====================
// MIDDLEWARE
// =====================
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload de arquivos (imagens)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|gif|mp4|mp3|wav/.test(file.mimetype);
    cb(null, ok);
  }
});

// Middleware de autenticação JWT
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Middleware para verificar plano PRO
function proMiddleware(req, res, next) {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || user.plan === 'free') {
    return res.status(403).json({
      error: 'Funcionalidade exclusiva para assinantes PRO',
      upgradeUrl: '/pricing'
    });
  }
  next();
}

// =====================
// ROTAS DE AUTH
// =====================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'E-mail já cadastrado' });

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(),
      name, email,
      password: hashed,
      plan: 'free',
      credits: 5, // 5 transformações grátis
      createdAt: new Date().toISOString()
    };
    db.users.push(user);

    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name, email, plan: user.plan, credits: user.credits } });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email, plan: user.plan, credits: user.credits } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, credits: user.credits });
});

// =====================
// ROTAS DE IA — TRANSFORMAÇÃO
// =====================

// 1. FACE SWAP (grátis com limite)
app.post('/api/transform/face-swap', authMiddleware, upload.fields([{ name: 'source' }, { name: 'target' }]), async (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.plan === 'free' && user.credits <= 0) {
    return res.status(403).json({ error: 'Créditos esgotados. Assine um plano para continuar.', upgradeUrl: '/pricing' });
  }

  try {
    const sourceImg = fs.readFileSync(req.files['source'][0].path, { encoding: 'base64' });
    const targetImg = fs.readFileSync(req.files['target'][0].path, { encoding: 'base64' });

    // Replicate API — InSwapper (face swap)
    const output = await replicate.run(
      "deepinsight/insightface:3d90a0965354425bb240b5d75a1bc837c4cd4d88e61e3fdb3bcf8e7d90c97fe8",
      {
        input: {
          source_image: `data:image/jpeg;base64,${sourceImg}`,
          target_image: `data:image/jpeg;base64,${targetImg}`,
          face_restore: true,
          face_restore_weight: 0.8
        }
      }
    );

    if (user.plan === 'free') user.credits--;
    res.json({ success: true, resultUrl: output, creditsLeft: user.credits });
  } catch (err) {
    res.status(500).json({ error: 'Erro no processamento: ' + err.message });
  }
});

// 2. GENDER SWAP (grátis com limite)
app.post('/api/transform/gender', authMiddleware, upload.single('image'), async (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.plan === 'free' && user.credits <= 0) {
    return res.status(403).json({ error: 'Créditos esgotados', upgradeUrl: '/pricing' });
  }

  try {
    const { targetGender } = req.body; // 'male' | 'female'
    const imageBase64 = fs.readFileSync(req.file.path, { encoding: 'base64' });
    const prompt = targetGender === 'female'
      ? 'Transform this person to a beautiful woman, realistic, high quality, photorealistic, detailed face'
      : 'Transform this person to a handsome man, realistic, high quality, photorealistic, detailed face';

    // Replicate — Stable Diffusion img2img
    const output = await replicate.run(
      "stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4af4b51f13cfd9e17b1e70f6c5e4f1e6d0",
      {
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt,
          negative_prompt: "deformed, ugly, blurry, unrealistic, cartoon",
          strength: 0.7,
          guidance_scale: 9.0,
          num_inference_steps: 50
        }
      }
    );

    if (user.plan === 'free') user.credits--;
    res.json({ success: true, resultUrl: output[0], creditsLeft: user.credits });
  } catch (err) {
    res.status(500).json({ error: 'Erro no processamento: ' + err.message });
  }
});

// 3. MELHORIA DE PELE E QUALIDADE (grátis)
app.post('/api/transform/enhance', authMiddleware, upload.single('image'), async (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (user.plan === 'free' && user.credits <= 0) {
    return res.status(403).json({ error: 'Créditos esgotados', upgradeUrl: '/pricing' });
  }

  try {
    const imageBase64 = fs.readFileSync(req.file.path, { encoding: 'base64' });

    // GFPGAN — face restoration + skin enhancement
    const output = await replicate.run(
      "tencentarc/gfpgan:9283608cc6b7be6b65a8e44983db012355f829a539ad48d9f55be36dfa5de4d",
      {
        input: {
          img: `data:image/jpeg;base64,${imageBase64}`,
          version: 'v1.4',
          scale: 2
        }
      }
    );

    if (user.plan === 'free') user.credits--;
    res.json({ success: true, resultUrl: output, creditsLeft: user.credits });
  } catch (err) {
    res.status(500).json({ error: 'Erro: ' + err.message });
  }
});

// 4. ALTERAÇÃO CORPORAL — PRO ONLY
app.post('/api/transform/body', authMiddleware, proMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { bodyType } = req.body; // 'muscular' | 'slim' | 'plus-size'
    const imageBase64 = fs.readFileSync(req.file.path, { encoding: 'base64' });

    const prompts = {
      muscular: 'photorealistic athletic muscular body, fit person, toned muscles, natural lighting',
      slim: 'photorealistic slim fit body, lean person, natural proportions',
      'plus-size': 'photorealistic plus size body, natural person, confident posture'
    };

    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompts[bodyType] || prompts.muscular,
          negative_prompt: 'deformed, unrealistic, cartoon, ugly',
          strength: 0.6
        }
      }
    );

    res.json({ success: true, resultUrl: output[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erro: ' + err.message });
  }
});

// 5. TRANSFORMAÇÃO DE VOZ — PRO ONLY
app.post('/api/transform/voice', authMiddleware, proMiddleware, upload.single('audio'), async (req, res) => {
  try {
    const { targetVoice } = req.body; // 'female-young' | 'male-deep' etc.
    const audioBase64 = fs.readFileSync(req.file.path, { encoding: 'base64' });

    // ElevenLabs Voice Conversion
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-speech', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio: audioBase64,
        voice_id: process.env[`ELEVEN_VOICE_${targetVoice?.toUpperCase()}`] || 'EXAVITQu4vr4xnSDxMaL',
        model_id: 'eleven_multilingual_v2'
      })
    });
    const audioData = await response.arrayBuffer();
    const audioB64 = Buffer.from(audioData).toString('base64');
    res.json({ success: true, audioBase64: audioB64 });
  } catch (err) {
    res.status(500).json({ error: 'Erro na transformação de voz: ' + err.message });
  }
});

// =====================
// ROTAS DE PAGAMENTO — MERCADO PAGO
// =====================
const PLANS = {
  weekly:    { price: 9.90,  label: 'MorphAI Semanal',   days: 7 },
  monthly:   { price: 29.90, label: 'MorphAI Pro Mensal', days: 30 },
  quarterly: { price: 69.90, label: 'MorphAI Pro Trimestral', days: 90 }
};

// Criar preferência de pagamento (Mercado Pago)
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = db.users.find(u => u.id === req.user.id);
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plano inválido' });

    const planInfo = PLANS[plan];
    const preference = await MercadoPago.preferences.create({
      items: [{
        title: planInfo.label,
        quantity: 1,
        unit_price: planInfo.price,
        currency_id: 'BRL'
      }],
      payer: { email: user.email },
      back_urls: {
        success: `${process.env.APP_URL}/payment/success?plan=${plan}&userId=${user.id}`,
        failure: `${process.env.APP_URL}/payment/failure`,
        pending: `${process.env.APP_URL}/payment/pending`
      },
      auto_return: 'approved',
      external_reference: `${user.id}_${plan}_${Date.now()}`,
      notification_url: `${process.env.APP_URL}/api/payment/webhook`
    });

    res.json({ checkoutUrl: preference.body.init_point, preferenceId: preference.body.id });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar pagamento: ' + err.message });
  }
});

// Webhook de confirmação do Mercado Pago
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment') {
      const payment = await MercadoPago.payment.findById(data.id);
      if (payment.body.status === 'approved') {
        const [userId, plan] = payment.body.external_reference.split('_');
        const user = db.users.find(u => u.id === userId);
        if (user) {
          user.plan = 'pro';
          user.credits = 9999;
          const planInfo = PLANS[plan];
          user.planExpiresAt = new Date(Date.now() + planInfo.days * 86400000).toISOString();
          db.payments.push({ id: data.id, userId, plan, amount: planInfo.price, status: 'approved', createdAt: new Date().toISOString() });
        }
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
});

// Stripe (alternativo — para usuários com cartão internacional)
app.post('/api/payment/stripe/create', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = db.users.find(u => u.id === req.user.id);
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plano inválido' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: PLANS[plan].label },
          unit_amount: Math.round(PLANS[plan].price * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      customer_email: user.email,
      metadata: { userId: user.id, plan },
      success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/pricing`
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Stripe
app.post('/api/payment/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const user = db.users.find(u => u.id === session.metadata.userId);
    if (user) {
      const plan = session.metadata.plan;
      user.plan = 'pro';
      user.credits = 9999;
      user.planExpiresAt = new Date(Date.now() + PLANS[plan].days * 86400000).toISOString();
    }
  }
  res.json({ received: true });
});

// =====================
// STATUS DE PLANO
// =====================
app.get('/api/user/plan', authMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Não encontrado' });
  const expired = user.planExpiresAt && new Date(user.planExpiresAt) < new Date();
  if (expired) { user.plan = 'free'; user.credits = 0; }
  res.json({ plan: user.plan, credits: user.credits, expiresAt: user.planExpiresAt });
});

// =====================
// START
// =====================
app.listen(PORT, () => {
  console.log(`\n🚀 MorphAI Server rodando em http://localhost:${PORT}`);
  console.log(`✅ APIs de IA: Replicate + ElevenLabs`);
  console.log(`💰 Pagamentos: Mercado Pago + Stripe`);
  console.log(`🔐 Auth: JWT\n`);
});
