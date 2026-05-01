const OpenAI = require('openai');
const https = require('https');

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
const MODEL = 'qwen3.6-flash';

const ACTIONS = {
  continue: (text, ctx) => `你是一位专业的网文写作助手。请根据以下内容续写，保持相同的文风和节奏，续写300-500字。直接输出续写正文，不要有任何开场白、说明或前缀：\n\n${text}\n\n${ctx ? `参考信息：${ctx}` : ''}`,
  rewrite: (text, ctx) => `你是一位专业的网文写作助手。请改写以下内容，使其更加流畅生动，保持原意。直接输出改写正文，不要有任何开场白、说明或前缀：\n\n${text}`,
  expand: (text, ctx) => `你是一位专业的网文写作助手。请扩写以下内容，增加细节描写和情感表达，扩写至原文2-3倍。直接输出扩写正文，不要有任何开场白、说明或前缀：\n\n${text}`,
  polish: (text, ctx) => `你是一位专业的网文写作助手。请润色以下内容，修正语病、优化表达，使文字更加优美。只输出润色后的正文，不要输出任何说明、解释或改动备注：\n\n${text}`,
  summarize: (text, ctx) => `请简洁地总结以下内容的主要情节（300字以内）。直接输出总结内容，不要有任何开场白或前缀：\n\n${text}`,
  outline: (text, ctx) => `你是一位专业的网文策划。请根据以下信息生成故事的宏观结构大纲，按卷或故事阶段划分，每个阶段描述核心事件、人物成长弧线和情节走向，不要生成具体章节细纲，不要按章节编号展开。直接输出大纲内容，不要有任何开场白或前缀：\n\n${text}`,
  brainstorm: (text, ctx) => `你是一位专业的网文策划。以下是小说最近章节的内容摘要：\n\n${text}\n\n请根据以上内容，提供5个不同风格的后续情节发展方向，每个方向用【方向N】标题，简述核心走向（50-80字）。直接输出方向列表，不要有任何开场白或前缀。${ctx ? `\n\n作者补充：${ctx}` : ''}`,
  conflict: (text, ctx) => `你是一位专业的网文策划。${ctx === 'major' ? `以下是作者描述的故事整体情况：\n\n${text}\n\n请设计3个贯穿全书的主线大冲突，每个用【大冲突N】标题，包含核心矛盾、对立双方、最终爆发点。` : `以下是小说最近章节的内容摘要：\n\n${text}\n\n请设计3个推动近期情节的章节小冲突，每个用【小冲突N】标题，包含起因、激化、爆发三个层次。`}直接输出冲突列表，不要有任何开场白或前缀。`,
  plot_twist: (text, ctx) => `你是一位专业的网文策划。以下是小说最近章节的内容摘要：\n\n${text}\n\n请设计3个出人意料的转折或反转，每个用【转折N】标题，说明转折前后的对比和读者心理冲击。直接输出转折列表，不要有任何开场白或前缀。`,
  hook: (text, ctx) => `你是一位专业的网文策划。以下是小说最近章节的内容摘要：\n\n${text}\n\n请生成5个吸引读者继续阅读的章节结尾钩子，每个用【钩子N】标题，要制造悬念、留下疑问或情感冲击。直接输出钩子列表，不要有任何开场白或前缀。`,
  proofread: (text) => `请检查以下文本中的错别字、语病和标点问题。必须只返回合法JSON数组，格式：[{"original":"原文片段","suggestion":"修改后","reason":"原因"}]，每条original必须是原文中实际存在的片段，禁止输出JSON以外的任何内容：\n\n${text}`,
  character: (text, ctx) => `你是一位专业的网文策划。请根据以下描述生成详细的人物设定（包括外貌、性格、背景、能力）。直接输出人物设定内容，不要有任何开场白或前缀：\n\n${text}`,
  title: (text, ctx) => `你是一位专业的网文策划。请根据以下故事简介，生成10个吸引人的书名和简介。直接输出书名列表，不要有任何开场白或前缀：\n\n${text}`,
  analyze_relations: (text) => `分析以下网文内容，提取人物及关系。必须只返回合法JSON，格式：{"characters":[{"name":"","role":""}],"relations":[{"source":"","target":"","label":""}]}，label必须极简（2-4个汉字，如"师徒"、"敌对"、"兄弟"），禁止输出任何JSON以外的内容：\n\n${text}`,
  writing_tip: (text) => `你是一位专业的网文写作导师。以下是作者最近创作的章节内容摘要：\n\n${text}\n\n请根据这些内容，给出一条具体、有针对性的写作技巧建议（50字以内，直接给出建议，不要有前缀说明）。`,
  inspiration_combo: (text) => `你是一位专业的网文策划。以下是小说最近章节的内容摘要：\n\n${text}\n\n请基于故事风格和当前情节，随机生成一组新颖的灵感组合，每次必须给出不同的创意，避免重复常见组合。必须只返回合法JSON，格式：{"setting":"场景（6字以内）","relation":"人物关系（6字以内）","conflict":"冲突类型（6字以内）"}，禁止输出JSON以外的任何内容。`,
  diagnose: (text) => `你是一位专业的网文写作导师。以下是作者创作的章节内容：\n\n${text}\n\n请从以下维度给出具体、有针对性的写作建议，每条建议直接指出问题并给出改进方向。必须只返回合法JSON数组，格式：[{"dimension":"维度名","issue":"发现的问题","suggestion":"改进建议"}]，维度从以下选取（选3-5个最相关的）：节奏控制、对话描写、场景描写、人物刻画、情节逻辑、伏笔钩子。禁止输出JSON以外的任何内容。`,
  raw: (text) => text,
};

exports.assist = async (req, res) => {
  const { action, text, context } = req.body;
  if (!text || !action || !ACTIONS[action]) {
    return res.status(400).json({ error: '参数错误' });
  }

  const JSON_ACTIONS = ['proofread', 'analyze_relations', 'inspiration_combo', 'diagnose'];
  try {
    const prompt = ACTIONS[action](text, context);
    const params = {
      model: MODEL,
      max_tokens: action === 'analyze_relations' ? 4096 : 2048,
      messages: [{ role: 'user', content: prompt }],
    };
    if (JSON_ACTIONS.includes(action)) {
      params.extra_body = { enable_thinking: false };
    }
    const message = await client.chat.completions.create(params);
    let result = message.choices[0].message.content;
    // 去除可能残留的 <think>...</think> 块
    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generateAvatar = async (req, res) => {
  const { name, role, appearance, personality, age_group, ethnicity, gender, novel_category } = req.body;
  const ageMap = {
    '5岁以下': 'toddler age 3-5', '5-10岁': 'child age 5-10', '10-15岁': 'young teen age 10-15',
    '15-18岁': 'teen age 15-18', '18-22岁': 'young adult age 18-22', '22-25岁': 'young adult age 22-25',
    '25-30岁': 'adult age 25-30', '30-35岁': 'adult age 30-35', '35-40岁': 'adult age 35-40',
    '40-50岁': 'middle-aged age 40-50', '50岁以上': 'older adult age 50+',
  };
  const genreStyleMap = {
    '玄幻': 'fantasy', '仙侠': 'xianxia', '武侠': 'wuxia',
    '都市': 'modern urban', '科幻': 'sci-fi', '历史': 'historical Chinese',
    '游戏': 'game fantasy', '悬疑': 'thriller', '言情': 'romance', '末世': 'post-apocalyptic',
  };
  const genreCasualMap = {
    '玄幻': 'casual ancient fantasy robes', '仙侠': 'casual xianxia hanfu', '武侠': 'casual wuxia clothing',
    '都市': 'casual modern everyday clothes', '科幻': 'casual futuristic outfit', '历史': 'casual historical Chinese clothing',
    '游戏': 'casual fantasy adventurer outfit', '悬疑': 'casual modern clothes', '言情': 'casual elegant clothing', '末世': 'casual post-apocalyptic outfit',
  };
  const clothingKeywords = ['wear', 'dress', 'robe', 'armor', 'suit', 'cloth', 'outfit', 'uniform', '穿', '衣', '服', '袍', '甲', '装'];
  const hasClothing = appearance && clothingKeywords.some(k => appearance.toLowerCase().includes(k));
  const casualClothing = !hasClothing ? (genreCasualMap[novel_category] || 'casual everyday clothing') : null;
  const parts = [
    gender && `${gender === '男' || gender === '雄性' ? 'handsome male' : 'beautiful female'}`,
    age_group && (ageMap[age_group] || age_group),
    ethnicity && ethnicity !== '人族' && `${ethnicity} race`,
    novel_category && (genreStyleMap[novel_category] || novel_category) + ' style',
    role && `${role}`,
    appearance && `${appearance}`,
    casualClothing && `wearing ${casualClothing}`,
    personality && `${personality} expression and aura`,
  ].filter(Boolean);
  const prompt = `anime illustration, ${parts.join(', ')}, upper body, beautiful face, highly detailed, big expressive eyes, perfect proportions, soft lighting, clean background, no text, no watermark, no random armor, masterpiece, best quality`;

  try {
    const body = JSON.stringify({
      model: 'wan2.7-image',
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
      },
      parameters: { size: '768*768', n: 1 },
    });

    const result = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'dashscope.aliyuncs.com',
        path: '/api/v1/services/aigc/multimodal-generation/generation',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    if (result.code) return res.status(500).json({ error: result.message || '生成失败' });

    // 同步响应，直接从 output 取图片 URL
    const imageUrl = result.output?.choices?.[0]?.message?.content?.[0]?.image
      || result.output?.results?.[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: '未获取到图片', detail: result });

    const base64 = await new Promise((resolve, reject) => {
      https.get(imageUrl, (r) => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
      }).on('error', reject);
    });
    res.json({ url: base64 });
  } catch (err) {
    console.error('[generateAvatar error]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.stream = async (req, res) => {
  const { action, text, context } = req.body;
  if (!text || !action || !ACTIONS[action]) {
    return res.status(400).json({ error: '参数错误' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const prompt = ACTIONS[action](text, context);
    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: action === 'proofread' ? 4096 : 2048,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
