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
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, credits: user.credits });
});

app.post('/api/transform/enhance', authMiddleware, upload.single('image'), async (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.plan === 'free' && user.credits <= 0) return res.status(403).json({ error: 'Créditos esgotados!', upgrade: true });

  try {
    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: '9283608cc6b7be6b65a8e44983db012355f829a539ad48d9f55be36dfa5de4d',
        input: { img: `data:${mimeType};base64,${imageBase64}`, version: 'v1.4', scale: 2 }
      })
    });

    const prediction = await response.json();
    if (!prediction.id) throw new Error('Erro ao criar predição');

    let result;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
      });
      result = await poll.json();
      if (result.status === 'succeeded') break;
      if (result.status === 'failed') throw new Error('IA falhou');
    }

    if (user.plan === 'free') user.credits--;
    res.json({ success: true, resultUrl: result.output, creditsLeft: user.credits });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/user/plan', authMiddleware, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ plan: user.plan, credits: user.credits });
});

app.listen(PORT, () => console.log(`✅ MorphAI rodando na porta ${PORT}`));
