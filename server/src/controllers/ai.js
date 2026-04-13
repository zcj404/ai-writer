const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTIONS = {
  continue: (text, ctx) => `你是一位专业的网文写作助手。请根据以下内容续写，保持相同的文风和节奏，续写300-500字：\n\n${text}\n\n${ctx ? `参考信息：${ctx}` : ''}`,
  rewrite: (text, ctx) => `你是一位专业的网文写作助手。请改写以下内容，使其更加流畅生动，保持原意：\n\n${text}`,
  expand: (text, ctx) => `你是一位专业的网文写作助手。请扩写以下内容，增加细节描写和情感表达，扩写至原文2-3倍：\n\n${text}`,
  polish: (text, ctx) => `你是一位专业的网文写作助手。请润色以下内容，修正语病、优化表达，使文字更加优美：\n\n${text}`,
  summarize: (text, ctx) => `请简洁地总结以下内容的主要情节（100字以内）：\n\n${text}`,
  outline: (text, ctx) => `你是一位专业的网文策划。请根据以下信息生成详细的章节大纲：\n\n${text}`,
  brainstorm: (text, ctx) => `你是一位专业的网文策划。请根据以下内容提供5个创意建议或情节发展方向：\n\n${text}`,
  proofread: (text, ctx) => `请检查以下文本中的错别字、语病和标点问题，列出问题并给出修改建议：\n\n${text}`,
  character: (text, ctx) => `你是一位专业的网文策划。请根据以下描述生成详细的人物设定（包括外貌、性格、背景、能力）：\n\n${text}`,
  title: (text, ctx) => `你是一位专业的网文策划。请根据以下故事简介，生成10个吸引人的书名和简介：\n\n${text}`,
};

exports.assist = async (req, res) => {
  const { action, text, context } = req.body;
  if (!text || !action || !ACTIONS[action]) {
    return res.status(400).json({ error: '参数错误' });
  }

  try {
    const prompt = ACTIONS[action](text, context);
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ result: message.content[0].text });
  } catch (err) {
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
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
