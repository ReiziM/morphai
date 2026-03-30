const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function runReplicate(version, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN nao configurado');
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, input })
  });
  const prediction = await createRes.json();
  if (!prediction.id) { console.error('Replicate error:', prediction); throw new Error(prediction.detail || 'Erro ao iniciar IA'); }
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, { headers: { 'Authorization': `Token ${token}` } });
    const result = await pollRes.json();
    console.log(`Poll ${i+1}: ${result.status}`);
    if (result.status === 'succeeded') return result.output;
    if (result.status === 'failed') throw new Error('IA falhou: ' + (result.error || 'erro'));
  }
  throw new Error('Timeout');
}

app.get('/', (req, res) => res.json({ status: 'MorphAI online!', version: '2.0' }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/transform/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    console.log('Iniciando enhance, bytes:', req.file.size);
    const output = await runReplicate(
      'tencentarc/gfpgan:0fbacf7afc6817b4c2c349c93f1e4c03edb8fcf9d9fccf2c9e54d16e93e6b74e',
      { img: dataUrl, version: 'v1.4', scale: 2 }
    );
    console.log('Resultado enhance:', output);
    res.json({ success: true, resultUrl: output });
  } catch (err) {
    console.error('Enhance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transform/gender', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const { targetGender } = req.body;
    const prompt = targetGender === 'female'
      ? 'beautiful woman, feminine features, long hair, soft skin, photorealistic portrait, high quality'
      : 'handsome man, masculine features, strong jaw, short hair, photorealistic portrait, high quality';
    const output = await runReplicate(
      'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
      { image: dataUrl, prompt, negative_prompt: 'ugly, blurry, deformed, cartoon', prompt_strength: 0.65, num_inference_steps: 30, guidance_scale: 7.5 }
    );
    res.json({ success: true, resultUrl: Array.isArray(output) ? output[0] : output });
  } catch (err) {
    console.error('Gender error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transform/face-swap', upload.fields([{ name: 'source' }, { name: 'target' }]), async (req, res) => {
  try {
    if (!req.files?.source || !req.files?.target) return res.status(400).json({ error: 'Envie source e target' });
    const s = req.files['source'][0]; const t = req.files['target'][0];
    const output = await runReplicate(
      'omniedgeio/face-swap:c2d783366e8d32e6abe9a3c313864f4e4e1fe4c04d6f2668975f49d4c85d6de4',
      { local_source: `data:${s.mimetype};base64,${s.buffer.toString('base64')}`, local_target: `data:${t.mimetype};base64,${t.buffer.toString('base64')}` }
    );
    res.json({ success: true, resultUrl: Array.isArray(output) ? output[0] : output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nMorphAI rodando na porta ${PORT}`);
  console.log(`Replicate: ${process.env.REPLICATE_API_TOKEN ? 'OK' : 'FALTANDO TOKEN'}`);
});
