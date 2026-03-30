const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Retorna o ID da predição imediatamente — frontend faz o polling
async function createPrediction(version, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN nao configurado');

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, input })
  });

  const prediction = await res.json();
  if (!prediction.id) {
    console.error('Replicate error:', prediction);
    throw new Error(prediction.detail || 'Erro ao iniciar IA');
  }
  return prediction;
}

app.get('/', (req, res) => res.json({ status: 'MorphAI online!', token: process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO' }));
app.get('/health', (req, res) => res.json({ ok: true }));

// Retorna token do replicate para o frontend fazer polling
app.get('/api/config', (req, res) => {
  res.json({ replicateToken: process.env.REPLICATE_API_TOKEN });
});

// ENHANCE — só cria predição e retorna ID
app.post('/api/transform/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    console.log('Criando predição enhance...');
    const prediction = await createPrediction(
      'tencentarc/gfpgan:0fbacf7afc6817b4c2c349c93f1e4c03edb8fcf9d9fccf2c9e54d16e93e6b74e',
      { img: dataUrl, version: 'v1.4', scale: 2 }
    );
    console.log('Predição criada:', prediction.id);
    res.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    console.error('Enhance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GENDER — só cria predição e retorna ID
app.post('/api/transform/gender', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const { targetGender } = req.body;
    const prompt = targetGender === 'female'
      ? 'beautiful woman, feminine features, long hair, soft skin, photorealistic portrait, high quality'
      : 'handsome man, masculine features, strong jaw, short hair, photorealistic portrait, high quality';
    const prediction = await createPrediction(
      'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
      { image: dataUrl, prompt, negative_prompt: 'ugly, blurry, deformed, cartoon', prompt_strength: 0.65, num_inference_steps: 30, guidance_scale: 7.5 }
    );
    res.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    console.error('Gender error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MorphAI rodando na porta ${PORT}`);
  console.log(`Replicate: ${process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO TOKEN'}`);
});
