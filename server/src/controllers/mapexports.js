const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const https = require('https');
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// In-memory job store: jobId -> { status, styleDesc, image_data, error }
const jobs = new Map();

exports.list = (req, res) => {
  const rows = db.prepare('SELECT id, project_id, name, image_data, created_at FROM map_exports WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.get = (req, res) => {
  const row = db.prepare('SELECT * FROM map_exports WHERE id = ? AND project_id = ? AND user_id = ?').get(req.params.id, req.params.projectId, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
};

exports.create = (req, res) => {
  const { name, image_data } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO map_exports (id, project_id, user_id, name, image_data) VALUES (?, ?, ?, ?, ?)').run(id, req.params.projectId, req.user.id, name, image_data);
  res.json(db.prepare('SELECT id, project_id, name, image_data, created_at FROM map_exports WHERE id = ?').get(id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM map_exports WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ success: true });
};

exports.jobStatus = (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
};

exports.generate = async (req, res) => {
  const { items, genre, svgDataUrl } = req.body;
  const geoItems = (items || []).filter(i => i.category === '地理' || i.category === '势力');

  // Use centroids of each item to build bounding box (not all polygon vertices)
  const centroids = geoItems.map(i => ({
    x: i.polygon?.length ? i.polygon.reduce((s,p)=>s+p.x,0)/i.polygon.length : (i.position?.x ?? 0),
    y: i.polygon?.length ? i.polygon.reduce((s,p)=>s+p.y,0)/i.polygon.length : (i.position?.y ?? 0),
  }));
  const minX = centroids.length ? Math.min(...centroids.map(p => p.x)) : -200;
  const maxX = centroids.length ? Math.max(...centroids.map(p => p.x)) : 200;
  const minY = centroids.length ? Math.min(...centroids.map(p => p.y)) : -200;
  const maxY = centroids.length ? Math.max(...centroids.map(p => p.y)) : 200;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

  const getDir = (cx, cy) => {
    const nx = (cx - minX) / rangeX;
    const ny = (cy - minY) / rangeY;
    const h = nx < 0.33 ? 'west' : nx < 0.66 ? 'center' : 'east';
    const v = ny < 0.33 ? 'north' : ny < 0.66 ? 'center' : 'south';
    return v === 'center' && h === 'center' ? 'center' : `${v}-${h}`.replace('-center','').replace('center-','');
  };

  const desc = geoItems.map((i, idx) => `${i.category}「${i.title}」位于地图${getDir(centroids[idx].x, centroids[idx].y)}`).join('；');
  const names = geoItems.map(i => i.title).join('、');

  const jobId = uuidv4();
  jobs.set(jobId, { status: 'styling', styleDesc: null, image_data: null, error: null });
  res.json({ jobId });

  (async () => {
    try {
      // Step 1: Pick style from fixed presets
      const STYLE_PRESETS = {
        'ancient-ink': 'ancient Chinese ink painting map, brush strokes, rice paper texture, with Chinese labels',
        'parchment': 'medieval parchment map, aged paper, hand-drawn illustration, with Chinese labels',
        'xianxia': 'Chinese xianxia fantasy map, cloud mist, jade green and gold tones, with Chinese labels',
        'scifi': 'sci-fi holographic map, neon lines, dark background, futuristic, with Chinese labels',
        'wasteland': 'post-apocalyptic wasteland map, dark tones, cracked earth, ruins, with Chinese labels',
        'wuxia': 'Chinese wuxia martial arts map, ink wash, mountain and river painting, with Chinese labels',
        'western-fantasy': 'western fantasy RPG map, colorful illustration, Tolkien style, with Chinese labels',
        'historical': 'ancient Chinese historical map, imperial cartography style, silk texture, with Chinese labels',
      };
      const presetKeys = Object.keys(STYLE_PRESETS).join(', ');
      const styleResp = await client.chat.completions.create({
        model: 'qwen3.6-flash',
        messages: [{ role: 'user', content: `Based on novel genre "${genre || 'unknown'}" and place names "${names || 'unknown'}", pick the best matching style key from: ${presetKeys}. Return only the key, nothing else.` }],
        max_tokens: 20,
      });
      const styleKey = styleResp.choices[0]?.message?.content?.trim().replace(/[^a-z-]/g, '') || 'parchment';
      const styleDesc = STYLE_PRESETS[styleKey] || STYLE_PRESETS['parchment'];
      jobs.set(jobId, { status: 'generating', styleDesc: styleKey, image_data: null, error: null });

      // Step 2: Build prompt - use SVG as layout reference
      const geoDesc = geoItems.map((i, idx) => i.category === '地理' ? `"${i.title}" at ${getDir(centroids[idx].x, centroids[idx].y)}` : null).filter(Boolean).join(', ');
      const factionDesc = geoItems.map((i, idx) => i.category === '势力' ? `"${i.title}" controls ${getDir(centroids[idx].x, centroids[idx].y)}` : null).filter(Boolean).join(', ');

      // Translate names to English/pinyin to avoid content filter
      const translateResp = await client.chat.completions.create({
        model: 'qwen3.6-flash',
        messages: [{ role: 'user', content: `Translate the following Chinese place names to English (keep order, same count). Use neutral fantasy English words — avoid "demon", "devil", "evil", "dark", "hell" etc., replace with neutral alternatives like "Shadow", "Mist", "Ancient", "Void". Return only comma-separated results: ${names || ''}` }],
        max_tokens: 100,
      });
      const engNames = translateResp.choices[0]?.message?.content?.trim() || names;
      const nameMap = names.split('、').reduce((m, n, i) => { m[n] = engNames.split(',')[i]?.trim() || n; return m; }, {});

      const toEng = str => str.replace(new RegExp(Object.keys(nameMap).join('|'), 'g'), m => nameMap[m] || m);

      const prompt = svgDataUrl
        ? `Top-down fantasy world map, ${styleDesc} style, follow the reference sketch layout. Clear continent outline. ${geoDesc ? 'Geography: ' + toEng(geoDesc) + '.' : ''} ${factionDesc ? 'Factions: ' + toEng(factionDesc) + '.' : ''} Label only these place names: ${engNames}. No other text.`
        : `Top-down fantasy world map, ${styleDesc} style. Clear continent outline. ${geoDesc ? 'Geography: ' + toEng(geoDesc) + '.' : ''} ${factionDesc ? 'Factions: ' + toEng(factionDesc) + '.' : ''} Label only these place names: ${engNames}. No other text.`;

      const content = svgDataUrl
        ? [{ type: 'image_url', image_url: { url: svgDataUrl } }, { type: 'text', text: prompt }]
        : [{ type: 'text', text: prompt }];

      // Step 3: Call qwen-image-2.0 via native DashScope API
      console.log('[mapexport] prompt:', prompt);
      const reqContent = svgDataUrl
        ? [{ image: svgDataUrl }, { text: prompt }]
        : [{ text: prompt }];
      const imgResult = await new Promise((resolve, reject) => {
        const data = JSON.stringify({
          model: 'qwen-image-2.0',
          input: { messages: [{ role: 'user', content: reqContent }] },
          parameters: { size: '1024*1024', n: 1 },
        });
        const req2 = https.request({
          hostname: 'dashscope.aliyuncs.com',
          path: '/api/v1/services/aigc/multimodal-generation/generation',
          method: 'POST',
          timeout: 120000,
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } }); });
        req2.on('error', reject);
        req2.on('timeout', () => { req2.destroy(); reject(new Error('请求超时')); });
        req2.write(data);
        req2.end();
      });
      console.log('[mapexport] imgResult:', JSON.stringify(imgResult).slice(0, 500));
      if (imgResult.code) { jobs.set(jobId, { status: 'failed', styleDesc, image_data: null, error: imgResult.message || '生成失败' }); return; }
      const imageUrl = imgResult.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image;
      if (!imageUrl) { jobs.set(jobId, { status: 'failed', styleDesc, image_data: null, error: '未获取到图片' }); return; }

      // Step 4: Download
      console.log(`[mapexport] downloading: ${imageUrl.slice(0, 80)}`);
      const getter = imageUrl.startsWith('https') ? https : require('http');
      const base64 = await new Promise((resolve, reject) => {
        getter.get(imageUrl, r => {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
        }).on('error', reject);
      });
      jobs.set(jobId, { status: 'done', styleDesc, image_data: base64, error: null });
    } catch (err) {
      const cur = jobs.get(jobId);
      jobs.set(jobId, { ...cur, status: 'failed', error: err.message });
    }
  })();
};
