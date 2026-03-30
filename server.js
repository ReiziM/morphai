const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Cria predição no Replicate usando endpoint clássico com hash de versão
async function createPrediction(version, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN nao configurado');

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ version, input })
  });

  const prediction = await res.json();
  console.log('Replicate create:', JSON.stringify(prediction).slice(0, 400));
  if (!prediction.id) throw new Error(prediction.detail || JSON.stringify(prediction));
  return prediction;
}

app.get('/', (req, res) => res.json({ status: 'MorphAI online!', token: process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO' }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({ replicateToken: process.env.REPLICATE_API_TOKEN }));

// ENHANCE — Real-ESRGAN + upscale (versão verificada e ativa)
app.post('/api/transform/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    console.log('Enhance iniciado, bytes:', req.file.size);

    // CodeFormer — restauração facial de alta qualidade
    const prediction = await createPrediction(
      'sczhou/codeformer:7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
      {
        image: dataUrl,
        codeformer_fidelity: 0.7,
        background_enhance: true,
        face_upsample: true,
        upscale: 2
      }
    );
    res.json({ predictionId: prediction.id, status: prediction.status });
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
      ? 'beautiful woman, feminine features, long hair, makeup, photorealistic, high quality portrait, 4k'
      : 'handsome man, masculine features, strong jaw, short hair, photorealistic, high quality portrait, 4k';

    // SDXL — geração de imagem de alta qualidade
    const prediction = await createPrediction(
      'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
      {
        prompt,
        negative_prompt: 'ugly, blurry, deformed, cartoon, unrealistic',
        num_inference_steps: 25,
        guidance_scale: 7.5,
        width: 1024,
        height: 1024
      }
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
