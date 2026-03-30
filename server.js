const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function createPrediction(model, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN nao configurado');

  // Usa a API nova do Replicate (com "model" em vez de "version")
  const res = await fetch('https://api.replicate.com/v1/models/' + model + '/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input })
  });

  const prediction = await res.json();
  console.log('Replicate response:', JSON.stringify(prediction).slice(0, 300));
  if (!prediction.id) throw new Error(prediction.detail || JSON.stringify(prediction));
  return prediction;
}

app.get('/', (req, res) => res.json({ status: 'MorphAI online!', token: process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO' }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({ replicateToken: process.env.REPLICATE_API_TOKEN }));

// ENHANCE — melhoria de pele e rosto
app.post('/api/transform/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    console.log('Criando predição enhance...');

    // Usa tencentarc/gfpgan via API nova
    const prediction = await createPrediction('tencentarc/gfpgan', { img: dataUrl, version: 'v1.4', scale: 2 });
    res.json({ predictionId: prediction.id, status: prediction.status, output: prediction.output });
  } catch (err) {
    console.error('Enhance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GENDER — mudança de gênero
app.post('/api/transform/gender', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const { targetGender } = req.body;
    const prompt = targetGender === 'female'
      ? 'beautiful woman, feminine features, long hair, soft skin, photorealistic portrait, high quality, 8k'
      : 'handsome man, masculine features, strong jaw, short hair, photorealistic portrait, high quality, 8k';

    // Usa stability-ai/sdxl via API nova
    const prediction = await createPrediction('stability-ai/sdxl', {
      image: dataUrl,
      prompt,
      negative_prompt: 'ugly, blurry, deformed, cartoon',
      prompt_strength: 0.65,
      num_inference_steps: 30,
      guidance_scale: 7.5
    });
    res.json({ predictionId: prediction.id, status: prediction.status, output: prediction.output });
  } catch (err) {
    console.error('Gender error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MorphAI rodando na porta ${PORT}`);
  console.log(`Replicate: ${process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO TOKEN'}`);
});
