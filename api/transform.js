export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType, type, targetGender } = req.body;
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'Token do Replicate não configurado' });
    if (!imageBase64) return res.status(400).json({ error: 'Imagem não enviada' });

    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    let version, input;

    if (type === 'gender') {
      const prompt = targetGender === 'female'
        ? 'beautiful woman, feminine features, long hair, makeup, photorealistic portrait, high quality'
        : 'handsome man, masculine features, strong jaw, short hair, photorealistic portrait, high quality';
      version = '7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc';
      input = { prompt, negative_prompt: 'ugly, blurry, deformed, cartoon', num_inference_steps: 25, guidance_scale: 7.5, width: 1024, height: 1024 };
    } else {
      // CodeFormer — melhoria facial
      version = '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56';
      input = { image: dataUrl, codeformer_fidelity: 0.7, background_enhance: true, face_upsample: true, upscale: 2 };
    }

    // Cria predição
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, input })
    });
    const prediction = await createRes.json();
    if (!prediction.id) return res.status(500).json({ error: prediction.detail || 'Erro ao iniciar IA' });

    // Polling — aguarda resultado (até 55s)
    const start = Date.now();
    while (Date.now() - start < 55000) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await pollRes.json();
      if (result.status === 'succeeded') {
        const url = Array.isArray(result.output) ? result.output[0] : result.output;
        return res.status(200).json({ success: true, resultUrl: url });
      }
      if (result.status === 'failed') return res.status(500).json({ error: 'IA falhou: ' + (result.error || 'erro') });
    }

    // Se demorou mais de 55s, retorna o ID para o frontend fazer polling
    return res.status(200).json({ predictionId: prediction.id, pending: true });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
