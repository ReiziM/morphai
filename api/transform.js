export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType, type, targetGender } = req.body;
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'Token nao configurado' });
    if (!imageBase64) return res.status(400).json({ error: 'Imagem nao enviada' });

    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    const authHeader = `Token ${token.trim()}`;

    let version, input;

    if (type === 'gender') {
      // Stable Diffusion 2.1 — gratuito no Replicate
      const prompt = targetGender === 'female'
        ? 'portrait of a beautiful woman, feminine, long hair, makeup, photorealistic, high quality, 8k'
        : 'portrait of a handsome man, masculine, short hair, strong jaw, photorealistic, high quality, 8k';

      version = 'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf';
      input = {
        prompt,
        negative_prompt: 'ugly, blurry, deformed, cartoon, bad anatomy, worst quality',
        image: dataUrl,
        strength: 0.65,
        guidance_scale: 7.5,
        num_inference_steps: 30
      };
    } else {
      // CodeFormer — melhoria facial gratuito
      version = '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56';
      input = {
        image: dataUrl,
        codeformer_fidelity: 0.7,
        background_enhance: true,
        face_upsample: true,
        upscale: 2
      };
    }

    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, input })
    });

    const prediction = await createRes.json();
    console.log('Prediction:', JSON.stringify(prediction).slice(0, 300));

    if (!prediction.id) {
      return res.status(500).json({ error: prediction.detail || JSON.stringify(prediction) });
    }

    // Polling até 55 segundos
    const start = Date.now();
    while (Date.now() - start < 55000) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': authHeader }
      });
      const result = await pollRes.json();
      if (result.status === 'succeeded') {
        const url = Array.isArray(result.output) ? result.output[0] : result.output;
        return res.status(200).json({ success: true, resultUrl: url });
      }
      if (result.status === 'failed') {
        return res.status(500).json({ error: 'IA falhou: ' + (result.error || 'erro desconhecido') });
      }
    }
    return res.status(500).json({ error: 'Tempo esgotado, tente novamente' });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
