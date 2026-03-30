const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'morphai2025secret';
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';

const users = [];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors({ origin: '*' }));
app.use(express.json());

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

app.get('/', (req, res) => res.json({ status: 'MorphAI API rodando!' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', replicate: !!REPLICATE_TOKEN }));

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email já cadastrado' });
    const hashed = await bcrypt.hash(password, 10);
    const user = { id: Date.now().toString(), name: name || 'Usuário', email, password: hashed, plan: 'free', credits: 5 };
    users.push(user);
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email, plan: user.plan, credits: user.credits } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email, plan: user.plan, credits: user.credits } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  if (!user) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, credits: user.credits });
});

app.post('/api/transform/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    // Converte imagem para base64
    const imageBase64 = req.file.buffer 
      ? req.file.buffer.toString('base64')
      : fs.readFileSync(req.file.path, { encoding: 'base64' });
    const mimeType = req.file.mimetype || 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;

    // GFPGAN v1.4 — restauração facial e melhoria de pele (modelo ativo no Replicate)
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'tencentarc/gfpgan:0fbacf7afc6817b4c2c349c93f1e4c03edb8fcf9d9fccf2c9e54d16e93e6b74e',
        input: {
          img: imageDataUrl,
          version: 'v1.4',
          scale: 2
        }
      })
    });

    const prediction = await createRes.json();
    if (!prediction.id) {
      console.error('Replicate error:', prediction);
      return res.status(500).json({ error: 'Erro ao iniciar IA. Verifique o token do Replicate.' });
    }

    // Aguarda resultado (polling)
    let result = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      result = await pollRes.json();
      if (result.status === 'succeeded') break;
      if (result.status === 'failed') {
        return res.status(500).json({ error: 'Processamento falhou no Replicate' });
      }
    }

    if (!result || !result.output) {
      return res.status(500).json({ error: 'Timeout — tente novamente' });
    }

    res.json({ success: true, resultUrl: result.output });
  } catch (err) {
    console.error('Enhance error:', err);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

app.post('/api/transform/gender', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    const imageBase64 = req.file.buffer
      ? req.file.buffer.toString('base64')
      : fs.readFileSync(req.file.path, { encoding: 'base64' });
    const mimeType = req.file.mimetype || 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
    const { targetGender } = req.body;

    const prompt = targetGender === 'female'
      ? 'beautiful woman, feminine features, long hair, makeup, photorealistic, high quality portrait'
      : 'handsome man, masculine features, short hair, strong jawline, photorealistic, high quality portrait';

    // Stable Diffusion img2img via Replicate
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
        input: {
          image: imageDataUrl,
          prompt: prompt,
          negative_prompt: 'deformed, ugly, blurry, cartoon, unrealistic, bad anatomy',
          prompt_strength: 0.7,
          num_inference_steps: 30,
          guidance_scale: 7.5
        }
      })
    });

    const prediction = await createRes.json();
    if (!prediction.id) {
      console.error('Replicate error:', prediction);
      return res.status(500).json({ error: 'Erro ao iniciar IA.' });
    }

    let result = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      result = await pollRes.json();
      if (result.status === 'succeeded') break;
      if (result.status === 'failed') return res.status(500).json({ error: 'Processamento falhou' });
    }

    if (!result || !result.output) return res.status(500).json({ error: 'Timeout' });
    res.json({ success: true, resultUrl: Array.isArray(result.output) ? result.output[0] : result.output });
  } catch (err) {
    console.error('Gender error:', err);
    res.status(500).json({ error: 'Erro: ' + err.message });
  }
});


