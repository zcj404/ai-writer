const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

const chat = (messages, max_tokens = 4000, model = 'qwen3.6-flash', extra_body = {}) =>
  client.chat.completions.create({ model, messages, max_tokens, extra_body })
    .then(r => r.choices[0].message.content.trim())
    .catch(err => {
      const msg = err?.message || '';
      if (err?.status === 429 || msg.includes('insufficient_quota') || msg.includes('Arrearage') || msg.includes('quota')) {
        const e = new Error('API余额不足，请充值后继续');
        e.code = 'QUOTA_EXCEEDED';
        throw e;
      }
      throw err;
    });

const chatMax = (messages, max_tokens) => chat(messages, max_tokens, 'qwen3.6-max-preview', { enable_thinking: false });

// List all AI novels for user
exports.list = (req, res) => {
  const rows = db.prepare('SELECT id, title, genre, premise, protagonist, total_volumes, chapters_per_volume, words_per_chapter, status, created_at FROM ai_novels WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
};

exports.get = (req, res) => {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  novel.memory = JSON.parse(novel.memory || '{}');
  res.json(novel);
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM ai_novels WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
};

exports.updateMemory = (req, res) => {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const memory = { ...JSON.parse(novel.memory || '{}'), ...req.body };
  db.prepare('UPDATE ai_novels SET memory = ? WHERE id = ?').run(JSON.stringify(memory), novel.id);
  res.json({ ok: true });
};

exports.updateNovel = (req, res) => {
  const novel = db.prepare('SELECT id FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const { title, genre, premise, protagonist, realm_system, official_system } = req.body;
  db.prepare('UPDATE ai_novels SET title = ?, genre = ?, premise = ?, protagonist = ?, realm_system = ?, official_system = ? WHERE id = ?')
    .run(title, genre, premise, protagonist, realm_system ?? '', official_system ?? '', req.params.id);
  res.json(db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(req.params.id));
};

// Step 1: Create novel + generate memory (world + characters) + volume outlines
exports.create = async (req, res) => {
  const { title, genre, premise, protagonist, total_volumes = 5, chapters_per_volume = 140, words_per_chapter = 3000 } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO ai_novels (id, user_id, title, genre, premise, protagonist, total_volumes, chapters_per_volume, words_per_chapter) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, title, genre, premise, protagonist, total_volumes, chapters_per_volume, words_per_chapter);
  res.json({ id });

  // Async: generate memory + volume outlines
  (async () => {
    try {
      const memoryText = await chat([{ role: 'user', content: `你是一位网文大神作家。根据以下信息，生成这部网文的世界观设定和主要人物设定。
类型：${genre}
标题：${title}
核心设定：${premise}
主角：${protagonist}

请用JSON格式返回，结构如下：
{
  "world": "世界观简介（300字以内）",
  "power_system": "力量体系说明（200字以内）",
  "protagonist": "主角详细设定（姓名、性格、初始状态、成长方向）",
  "supporting_chars": ["配角1简介", "配角2简介", "配角3简介"],
  "antagonist": "主要反派设定"
}
只返回JSON，不要其他内容。` }]);

      let memory = {};
      try { memory = JSON.parse(memoryText.replace(/```json\n?|\n?```/g, '')); } catch(_) {}
      db.prepare('UPDATE ai_novels SET memory = ? WHERE id = ?').run(JSON.stringify(memory), id);

      // Generate volume outlines
      const volOutlineText = await chat([{ role: 'user', content: `你是一位网文大神作家。根据以下设定，为这部网文规划${total_volumes}卷的故事大纲。
类型：${genre}，标题：${title}
核心设定：${premise}
世界观：${memory.world || ''}
主角：${memory.protagonist || protagonist}
反派：${memory.antagonist || ''}

要求：
- 每卷约${chapters_per_volume}章，每章${words_per_chapter}字
- 每卷有独立的小目标和高潮
- 整体遵循"起承转合"结构，第${total_volumes}卷完结
- 爽点要足够，符合网文读者口味

请用JSON数组返回，每项结构：
{"volume_num": 1, "title": "卷标题", "outline": "本卷主线剧情（200字以内）"}
只返回JSON数组，不要其他内容。` }]);

      let volOutlines = [];
      try { volOutlines = JSON.parse(volOutlineText.replace(/```json\n?|\n?```/g, '')); } catch(_) {}

      const insertVol = db.prepare('INSERT INTO ai_novel_volumes (id, novel_id, user_id, volume_num, title, outline, status) VALUES (?,?,?,?,?,?,?)');
      for (const v of volOutlines) {
        insertVol.run(uuidv4(), id, req.user.id, v.volume_num, v.title, v.outline, 'pending');
      }
      db.prepare("UPDATE ai_novels SET status = 'volumes_ready' WHERE id = ?").run(id);
    } catch(err) {
      console.error('[ainovel] create error:', err.message);
      const msg = err.code === 'QUOTA_EXCEEDED' ? err.message : '生成失败';
      db.prepare("UPDATE ai_novels SET status = 'error', error_msg = ? WHERE id = ?").run(msg, id);
    }
  })();
};

// Get volumes for a novel
exports.listVolumes = (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_novel_volumes WHERE novel_id = ? AND user_id = ? ORDER BY volume_num').all(req.params.id, req.user.id);
  res.json(rows);
};

// Update volume outline (user edits)
exports.updateVolume = (req, res) => {
  const { title, outline } = req.body;
  db.prepare('UPDATE ai_novel_volumes SET title = ?, outline = ? WHERE id = ? AND user_id = ?').run(title, outline, req.params.vid, req.user.id);
  res.json(db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ?').get(req.params.vid));
};

// Add a new volume (AI generates outline based on previous volumes)
exports.addVolume = async (req, res) => {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const existingVols = db.prepare('SELECT * FROM ai_novel_volumes WHERE novel_id = ? ORDER BY volume_num').all(novel.id);
  const nextNum = existingVols.length + 1;
  const id = uuidv4();
  db.prepare('INSERT INTO ai_novel_volumes (id, novel_id, user_id, volume_num, title, outline, status) VALUES (?,?,?,?,?,?,?)').run(id, novel.id, req.user.id, nextNum, `第${nextNum}卷`, '', 'pending');
  res.json(db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ?').get(id));

  // AI generate outline async
  (async () => {
    try {
      const memory = JSON.parse(novel.memory || '{}');
      const prevContext = existingVols.map(v => `第${v.volume_num}卷《${v.title}》：${v.outline}`).join('\n');
      const text = await chat([{ role: 'user', content: `你是一位网文大神作家。请为以下小说续写第${nextNum}卷的大纲。

小说：${novel.title}（${novel.genre}）
主角：${novel.protagonist}
世界观：${memory.world || ''}
力量体系：${memory.power_system || ''}

已有卷大纲：
${prevContext}

请续写第${nextNum}卷，要求：
- 承接上一卷剧情，有独立的小目标和高潮
- 约${novel.chapters_per_volume}章，每章${novel.words_per_chapter}字
- 符合网文风格，爽点突出

用JSON返回：{"title": "卷标题", "outline": "本卷主线剧情（200字以内）"}
只返回JSON，不要其他内容。` }]);
      let parsed = { title: `第${nextNum}卷`, outline: '' };
      try { parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '')); } catch(_) {}
      db.prepare('UPDATE ai_novel_volumes SET title = ?, outline = ?, status = ? WHERE id = ?').run(parsed.title, parsed.outline, 'pending', id);
    } catch(err) {
      db.prepare('UPDATE ai_novel_volumes SET error_msg = ? WHERE id = ?').run(err.message, id);
    }
  })();
};

// Regenerate chapter outline based on actual content
exports.regenerateSummary = async (req, res) => {
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap || !chap.content) return res.status(400).json({ error: 'No content' });
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(chap.novel_id);
  const memory = JSON.parse(novel.memory || '{}');
  try {
    const text = await chat([{ role: 'user', content: `你是一位网文大神作家。请根据以下章节正文内容，重新提炼本章细纲。

小说：${novel.title}（${novel.genre}）
世界观：${memory.world || ''}

第${chap.chapter_num}章《${chap.title}》正文：
${chap.content}

请用500-700字概括本章细纲，包含开场情境、核心冲突/事件、爽点/转折、结尾钩子。只返回细纲内容，不要其他说明。` }], 1500);
    const summary = await chat([{ role: 'user', content: `用一句话（50字以内）概括以下章节内容的核心事件：\n${chap.content.slice(0, 1000)}` }], 100);
    db.prepare('UPDATE ai_novel_chapters SET outline = ?, summary = ? WHERE id = ?').run(text.trim(), summary, chap.id);
    res.json({ outline: text.trim() });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};

exports.extractProtagonistStatus = async (req, res) => {
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap || !chap.content) return res.status(400).json({ error: 'No content' });
  const prevChap = db.prepare("SELECT protagonist_status FROM ai_novel_chapters WHERE novel_id = ? AND chapter_num < ? AND status = 'done' ORDER BY chapter_num DESC LIMIT 1").get(chap.novel_id, chap.chapter_num);
  const lastStatus = prevChap?.protagonist_status || '';
  try {
    const statusPrompt = lastStatus
      ? `根据以下章节正文，在原有主角状态基础上更新主角状态（如有变化）。只输出更新后的状态文本，不要任何说明。\n\n原状态：\n${lastStatus}\n\n本章正文（节选）：\n${chap.content.slice(0, 2000)}`
      : `根据以下章节正文，提取主角当前状态（境界、功法、武技、金手指积分等关键信息）。只输出状态文本，不要任何说明。\n\n本章正文（节选）：\n${chap.content.slice(0, 2000)}`;
    const newStatus = await chat([{ role: 'user', content: statusPrompt }], 300);
    db.prepare('UPDATE ai_novel_chapters SET protagonist_status = ? WHERE id = ?').run(newStatus, chap.id);
    res.json({ protagonist_status: newStatus });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};

// Approve volume → generate chapter outlines
exports.approveVolume = async (req, res) => {
  const vol = db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ? AND user_id = ?').get(req.params.vid, req.user.id);
  if (!vol) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE ai_novel_volumes SET status = 'generating' WHERE id = ?").run(vol.id);
  res.json({ ok: true });

  (async () => {
    try {
      const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(vol.novel_id);
      await generateChapterOutlines(novel, vol, req.user.id);
      db.prepare("UPDATE ai_novel_volumes SET status = 'approved' WHERE id = ?").run(vol.id);
    } catch(err) {
      console.error('[ainovel] approveVolume error:', err.message);
      const msg = err.code === 'QUOTA_EXCEEDED' ? err.message : '生成失败';
      db.prepare("UPDATE ai_novel_volumes SET status = 'error', error_msg = ? WHERE id = ?").run(msg, vol.id);
    }
  })();
};

// Get chapters for a volume
exports.listChapters = (req, res) => {
  const rows = db.prepare('SELECT id, novel_id, volume_id, chapter_num, title, outline, status, word_count, error_msg FROM ai_novel_chapters WHERE volume_id = ? AND user_id = ? ORDER BY chapter_num')
    .all(req.params.vid, req.user.id);
  res.json(rows);
};

exports.getChapter = (req, res) => {
  const row = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
};

exports.updateChapter = (req, res) => {
  const { title, outline, content, protagonist_status } = req.body;
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  const newTitle = title ?? chap.title;
  const newOutline = outline ?? chap.outline;
  const newContent = content ?? chap.content;
  const wordCount = content != null ? content.length : chap.word_count;
  const newStatus = protagonist_status ?? chap.protagonist_status;
  db.prepare('UPDATE ai_novel_chapters SET title = ?, outline = ?, content = ?, word_count = ?, protagonist_status = ? WHERE id = ?')
    .run(newTitle, newOutline, newContent, wordCount, newStatus, req.params.cid);
  res.json(db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ?').get(req.params.cid));
};

exports.addChapter = (req, res) => {
  const vol = db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ? AND user_id = ?').get(req.params.vid, req.user.id);
  if (!vol) return res.status(404).json({ error: 'Not found' });
  const { title = '新章节', outline = '', ai = false, insert_after = null } = req.body;
  let chapter_num;
  if (insert_after != null) {
    // Shift all chapters after insert_after up by 1
    db.prepare('UPDATE ai_novel_chapters SET chapter_num = chapter_num + 1 WHERE volume_id = ? AND chapter_num > ?').run(vol.id, insert_after);
    chapter_num = insert_after + 1;
  } else {
    const maxNum = db.prepare('SELECT MAX(chapter_num) as m FROM ai_novel_chapters WHERE volume_id = ?').get(vol.id);
    chapter_num = (maxNum?.m || 0) + 1;
  }
  const id = uuidv4();
  db.prepare('INSERT INTO ai_novel_chapters (id, novel_id, volume_id, user_id, chapter_num, title, outline, status) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, vol.novel_id, vol.id, req.user.id, chapter_num, title, outline, 'pending');
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ?').get(id);
  res.json(chap);

  if (!ai) return;
  (async () => {
    try {
      const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(vol.novel_id);
      const memory = JSON.parse(novel.memory || '{}');
      const prevChaps = db.prepare("SELECT chapter_num, title, outline, summary FROM ai_novel_chapters WHERE volume_id = ? AND chapter_num < ? ORDER BY chapter_num DESC LIMIT 5").all(vol.id, chapter_num);
      prevChaps.reverse();
      const nextChaps = db.prepare("SELECT chapter_num, title, outline FROM ai_novel_chapters WHERE volume_id = ? AND chapter_num >= ? ORDER BY chapter_num LIMIT 3").all(vol.id, chapter_num);
      const prevContext = prevChaps.map(c => `第${c.chapter_num}章《${c.title}》：${c.outline}`).join('\n');
      const nextContext = nextChaps.length ? '\n后续章节（需要衔接）：\n' + nextChaps.map(c => `第${c.chapter_num}章《${c.title}》：${c.outline}`).join('\n') : '';
      const text = await chat([{ role: 'user', content: `你是一位网文大神作家。请为以下小说在第${chapter_num}章位置插入一章新的章节细纲。

小说：${novel.title}（${novel.genre}）
世界观：${memory.world || ''}
本卷大纲：${vol.outline}

前几章细纲：
${prevContext}${nextContext}

请续写第${chapter_num}章细纲，100-150字，包含开场情境、核心冲突/事件、爽点/转折、结尾钩子，需要自然衔接前后章节。人物设定和社会关系必须符合现实逻辑，不能出现明显不合常识的设定。
用JSON返回：{"title": "章节标题", "outline": "章节细纲"}
只返回JSON，不要其他内容。` }]);
      let parsed = { title: `第${chapter_num}章`, outline: '' };
      try { parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '')); } catch(_) {}
      db.prepare('UPDATE ai_novel_chapters SET title = ?, outline = ? WHERE id = ?').run(parsed.title, parsed.outline, id);
    } catch(err) {
      console.error('[ainovel] addChapter AI error:', err.message);
    }
  })();
};

exports.removeChapter = (req, res) => {
  db.prepare('DELETE FROM ai_novel_chapters WHERE id = ? AND user_id = ?').run(req.params.cid, req.user.id);
  res.json({ ok: true });
};

// Generate content for a single chapter
exports.generateChapter = async (req, res) => {
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE ai_novel_chapters SET status = 'generating' WHERE id = ?").run(chap.id);
  res.json({ ok: true });

  (async () => {
    try {
      await generateChapterContent(chap);
    } catch(err) {
      console.error('[ainovel] generateChapter error:', err.message);
      const msg = err.code === 'QUOTA_EXCEEDED' ? err.message : '生成失败';
      db.prepare("UPDATE ai_novel_chapters SET status = 'error', error_msg = ? WHERE id = ?").run(msg, chap.id);
    }
  })();
};


// Estimate token count (Chinese ~1.5 token/char, English ~0.25 token/char)
function estimateTokens(text) {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese * 1.5 + other * 0.25);
}

function historyTokens(history) {
  return history.reduce((s, m) => s + estimateTokens(m.content), 0);
}

// Get or create chat record
function getChatRecord(novelId, mode) {
  const { v4: uuid } = require('uuid');
  let rec = db.prepare('SELECT * FROM ai_novel_chats WHERE novel_id = ? AND mode = ?').get(novelId, mode);
  if (!rec) {
    const id = uuid();
    db.prepare('INSERT INTO ai_novel_chats (id, novel_id, mode, history) VALUES (?,?,?,?)').run(id, novelId, mode, '[]');
    rec = db.prepare('SELECT * FROM ai_novel_chats WHERE id = ?').get(id);
  }
  return rec;
}

// AI chat to adjust world/volume outlines
exports.chat = async (req, res) => {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const { message, mode = 'outline' } = req.body;
  const memory = JSON.parse(novel.memory || '{}');
  const allVols = db.prepare('SELECT volume_num, title, outline FROM ai_novel_volumes WHERE novel_id = ? ORDER BY volume_num').all(novel.id);
  const volsContext = allVols.map(v => `第${v.volume_num}卷《${v.title}》：${v.outline}`).join('\n');

  const systemContext = `你是一位网文大神作家，正在帮助作者打磨小说的世界观和卷大纲。

小说：《${novel.title}》（${novel.genre}）
核心设定：${novel.premise}
主角：${novel.protagonist}
世界观：${memory.world || ''}
力量体系：${memory.power_system || ''}

各卷大纲：
${volsContext}

【重要规则】
1. 回复中不要输出任何markdown代码块（不要用\`\`\`包裹任何内容）。
2. 当用户明确提出修改请求（如"加入XXX"、"修改XXX"、"把XXX改成XXX"等），必须直接给出修改后的完整内容，并在回复末尾附上PROPOSAL块供作者一键应用：
修改世界观：
<<<PROPOSAL>>>
{"type":"world","world":"完整新世界观内容（包含原有内容+新增内容）","power_system":"完整新力量体系"}
<<<END>>>
修改某卷大纲：
<<<PROPOSAL>>>
{"type":"volume","volume_num":N,"title":"卷标题","outline":"完整新大纲正文（不少于150字，直接写情节内容）"}
<<<END>>>
3. PROPOSAL块中world/outline字段必须包含完整内容（不能只写新增部分，要把原有内容和新增内容合并后完整输出）。
4. 纯讨论、提问、分析时不输出PROPOSAL块。
5. 所有建议必须符合现实逻辑，人物设定、社会关系、势力强弱等不能出现明显不合常识的设定。`;

  // Load persistent history
  const chatRec = getChatRecord(novel.id, 'outline');
  let history = JSON.parse(chatRec.history);

  // Token compression: if history > 10000 tokens, summarize older messages
  if (historyTokens(history) > 10000) {
    const keepRecent = history.slice(-5);
    const toSummarize = history.slice(0, -5);
    if (toSummarize.length > 0) {
      const summaryText = toSummarize.map(m => `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`).join('\n');
      try {
        const summary = await chat([{ role: 'user', content: `请用200字以内概括以下对话的核心内容和已达成的共识：\n${summaryText}` }], 300);
        history = [{ role: 'assistant', content: `[历史对话摘要] ${summary}` }, ...keepRecent];
      } catch(_) { history = keepRecent; }
    }
  }

  const messages = [
    { role: 'system', content: systemContext },
    ...history,
    { role: 'user', content: message },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.chat.completions.create({ model: 'qwen3.6-flash', messages, max_tokens: 2000, stream: true });
    let fullReply = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullReply += token;
        // Don't stream PROPOSAL block tokens to client
        const displaySoFar = fullReply.replace(/<<<PROPOSAL>>>[\s\S]*?(<<<END>>>|$)/g, '').trim();
        res.write(`data: ${JSON.stringify({ token, display: displaySoFar })}\n\n`);
      }
    }

    // Extract PROPOSAL block
    const proposalMatch = fullReply.match(/<<<PROPOSAL>>>\s*([\s\S]*?)\s*<<<END>>>/);
    let proposal = null;
    if (proposalMatch) {
      try { proposal = JSON.parse(proposalMatch[1]); } catch(_) {}
    }

    const displayReply = fullReply.replace(/<<<PROPOSAL>>>[\s\S]*?<<<END>>>/g, '').trim();

    const newHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: fullReply }];
    db.prepare('UPDATE ai_novel_chats SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE novel_id = ? AND mode = ?')
      .run(JSON.stringify(newHistory), novel.id, 'outline');

    res.write(`data: ${JSON.stringify({ done: true, displayReply, proposal })}\n\n`);
    res.end();
  } catch(err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};

exports.getChapterChatHistory = (req, res) => {
  const chap = db.prepare('SELECT id FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  const rec = db.prepare('SELECT history FROM ai_chapter_chats WHERE chapter_id = ?').get(req.params.cid);
  res.json({ history: rec ? JSON.parse(rec.history) : [] });
};

exports.clearChapterChatHistory = (req, res) => {
  const chap = db.prepare('SELECT id FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT INTO ai_chapter_chats (chapter_id, user_id, history) VALUES (?,?,?) ON CONFLICT(chapter_id) DO UPDATE SET history=excluded.history, updated_at=CURRENT_TIMESTAMP')
    .run(req.params.cid, req.user.id, '[]');
  res.json({ ok: true });
};

exports.updateChapterChatHistory = (req, res) => {
  const chap = db.prepare('SELECT id FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT INTO ai_chapter_chats (chapter_id, user_id, history) VALUES (?,?,?) ON CONFLICT(chapter_id) DO UPDATE SET history=excluded.history, updated_at=CURRENT_TIMESTAMP')
    .run(req.params.cid, req.user.id, JSON.stringify(req.body.history || []));
  res.json({ ok: true });
};

exports.applyChapterProposal = async (req, res) => {
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  const { outlineProposal, revisedProposal } = req.body;
  if (outlineProposal) {
    db.prepare('UPDATE ai_novel_chapters SET title = ?, outline = ? WHERE id = ?')
      .run(outlineProposal.title || chap.title, outlineProposal.outline || chap.outline, chap.id);
  }
  if (revisedProposal) {
    const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(chap.novel_id);
    const summary = await chat([{ role: 'user', content: `用一句话（50字以内）概括以下章节内容的核心事件：\n${revisedProposal.slice(0, 1000)}` }], 100);
    db.prepare("UPDATE ai_novel_chapters SET content = ?, summary = ?, word_count = ?, status = 'done' WHERE id = ?")
      .run(revisedProposal, summary, revisedProposal.length, chap.id);
  }
  res.json({ ok: true });
};

exports.getChatHistory = (req, res) => {
  const novel = db.prepare('SELECT id FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const rec = db.prepare('SELECT history FROM ai_novel_chats WHERE novel_id = ? AND mode = ?').get(req.params.id, 'outline');
  res.json({ history: rec ? JSON.parse(rec.history) : [] });
};

exports.updateChatHistory = (req, res) => {
  const novel = db.prepare('SELECT id FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const { history } = req.body;
  db.prepare('UPDATE ai_novel_chats SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE novel_id = ? AND mode = ?')
    .run(JSON.stringify(history), req.params.id, 'outline');
  res.json({ ok: true });
};

exports.applyProposal = (req, res) => {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!novel) return res.status(404).json({ error: 'Not found' });
  const { proposal } = req.body;
  if (!proposal) return res.status(400).json({ error: 'No proposal' });
  try {
    if (proposal.type === 'volume') {
      db.prepare('UPDATE ai_novel_volumes SET title = ?, outline = ? WHERE novel_id = ? AND volume_num = ?')
        .run(proposal.title || '', proposal.outline || '', novel.id, proposal.volume_num);
    } else if (proposal.type === 'world') {
      const memory = JSON.parse(novel.memory || '{}');
      if (proposal.world) memory.world = proposal.world;
      if (proposal.power_system) memory.power_system = proposal.power_system;
      db.prepare('UPDATE ai_novels SET memory = ? WHERE id = ?').run(JSON.stringify(memory), novel.id);
    }
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};

// Bulk generate all pending chapters in a volume
exports.pauseVolume = (req, res) => {
  db.prepare("UPDATE ai_novel_volumes SET is_paused = 1 WHERE id = ? AND user_id = ?").run(req.params.vid, req.user.id);
  res.json({ ok: true });
};

exports.resumeVolume = async (req, res) => {
  const vol = db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ? AND user_id = ?').get(req.params.vid, req.user.id);
  if (!vol) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE ai_novel_volumes SET is_paused = 0 WHERE id = ?").run(vol.id);
  const pending = db.prepare("SELECT id FROM ai_novel_chapters WHERE volume_id = ? AND status = 'pending' ORDER BY chapter_num").all(vol.id);
  res.json({ total: pending.length });
  runGenerateVolume(vol, pending);
};


// Chat about a specific chapter (revise content)
exports.chatChapter = async (req, res) => {
  const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ? AND user_id = ?').get(req.params.cid, req.user.id);
  if (!chap) return res.status(404).json({ error: 'Not found' });
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(chap.novel_id);
  const memory = JSON.parse(novel.memory || '{}');
  const { message } = req.body;

  const prevChaps = db.prepare("SELECT chapter_num, title, outline, content FROM ai_novel_chapters WHERE novel_id = ? AND chapter_num < ? AND status = 'done' ORDER BY chapter_num DESC LIMIT 3").all(chap.novel_id, chap.chapter_num);
  prevChaps.reverse();
  const prevContext = prevChaps.map(c => `第${c.chapter_num}章《${c.title}》：${c.outline}`).join('\n');
  const lastChapEnding = prevChaps.length > 0 ? (prevChaps[prevChaps.length - 1].content || '').slice(-500) : '';

  const systemContext = `你是一位网文大神作家助手。用户正在讨论以下章节，可以讨论细纲或正文内容。
小说：${novel.title}（${novel.genre}）
世界观：${memory.world || ''}，力量体系：${memory.power_system || ''}
${prevContext ? '前几章细纲：\n' + prevContext + '\n' : ''}${lastChapEnding ? '上一章结尾：\n' + lastChapEnding + '\n' : ''}当前章节：第${chap.chapter_num}章《${chap.title}》
当前正文（完整）：
${chap.content || '（正文尚未生成）'}
本章目标字数：${novel.words_per_chapter}字

【重要规则】
1. 回复中不要输出任何markdown代码块（不要用\`\`\`包裹任何内容）。
2. 主角的金手指/系统只有主角自己知道，其他任何角色不可见、不可感知、不可察觉。
3. 当用户明确要求修改细纲时，给出修改方案后在回复末尾附上：
<<<OUTLINE>>>
{"title":"新标题","outline":"新细纲内容"}
<<<END>>>
3. 当用户明确要求修改或扩写正文时，必须输出完整正文（字数达到用户要求或目标字数${novel.words_per_chapter}字），在回复末尾附上：
<<<REVISED>>>
（完整正文内容，必须达到字数要求）
<<<END>>>
4. 正文修改必须基于当前正文内容进行修改/扩充，不能凭空重写。
5. 纯讨论时不输出任何块标记。`;

  // Load persistent history
  let rec = db.prepare('SELECT history FROM ai_chapter_chats WHERE chapter_id = ?').get(chap.id);
  if (!rec) {
    db.prepare('INSERT INTO ai_chapter_chats (chapter_id, user_id, history) VALUES (?,?,?)').run(chap.id, req.user.id, '[]');
    rec = { history: '[]' };
  }
  let history = JSON.parse(rec.history);

  // Token compression at 10000 (keep content fixed in system, compress history only)
  if (historyTokens(history) > 10000) {
    const keepRecent = history.slice(-5);
    const toSummarize = history.slice(0, -5);
    if (toSummarize.length > 0) {
      const summaryText = toSummarize.map(m => `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`).join('\n');
      try {
        const summary = await chat([{ role: 'user', content: `请用200字以内概括以下对话的核心内容和已达成的共识：\n${summaryText}` }], 300);
        history = [{ role: 'assistant', content: `[历史对话摘要] ${summary}` }, ...keepRecent];
      } catch(_) { history = keepRecent; }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.chat.completions.create({
      model: 'qwen3.6-max-preview', max_tokens: 8000, stream: true,
      messages: [{ role: 'system', content: systemContext }, ...history, { role: 'user', content: message }],
    });
    let fullReply = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullReply += token;
        // Show everything to user, just hide the marker tags themselves
        const display = fullReply
          .replace(/<<<(OUTLINE|REVISED)>>>/g, '')
          .replace(/<<<END>>>/g, '')
          .trim();
        res.write(`data: ${JSON.stringify({ token, display })}\n\n`);
      }
    }

    // Extract proposals
    const outlineMatch = fullReply.match(/<<<OUTLINE>>>\s*([\s\S]*?)\s*<<<END>>>/);
    let outlineProposal = null;
    if (outlineMatch) {
      try { outlineProposal = JSON.parse(outlineMatch[1]); } catch(_) {}
    }

    const revisedMatch = fullReply.match(/<<<REVISED>>>\s*([\s\S]*?)\s*<<<END>>>/);
    let revisedProposal = null;
    if (revisedMatch) revisedProposal = revisedMatch[1].trim();

    const displayReply = fullReply.replace(/<<<(OUTLINE|REVISED)>>>[\s\S]*?<<<END>>>/g, '').trim();

    // Build full display text (same as frontend)
    let fullDisplayText = displayReply;
    if (revisedProposal) fullDisplayText = (fullDisplayText ? fullDisplayText + '\n\n' : '') + `[已生成修改正文，点击下方按钮应用]`;
    if (outlineProposal?.outline) fullDisplayText = (fullDisplayText ? fullDisplayText + '\n\n' : '') + `新细纲：\n${outlineProposal.outline}`;

    // Save history, keep last 10 messages
    let newHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: fullDisplayText, outlineProposal: outlineProposal || undefined, revisedProposal: revisedProposal || undefined }];
    if (newHistory.length > 10) newHistory = newHistory.slice(newHistory.length - 10);
    try {
      db.prepare('INSERT INTO ai_chapter_chats (chapter_id, user_id, history, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chapter_id) DO UPDATE SET history=excluded.history, updated_at=CURRENT_TIMESTAMP')
        .run(chap.id, chap.user_id, JSON.stringify(newHistory));
    } catch(e) { console.error('[chatChapter] save history error:', e.message); }

    res.write(`data: ${JSON.stringify({ done: true, displayReply, outlineProposal, revisedProposal })}\n\n`);
    res.end();
  } catch(err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};

async function generateChapterContent(chap) {
  const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(chap.novel_id);
  const memory = JSON.parse(novel.memory || '{}');
  const prevChaps = db.prepare("SELECT chapter_num, title, outline, content, protagonist_status FROM ai_novel_chapters WHERE novel_id = ? AND chapter_num < ? AND status = 'done' ORDER BY chapter_num DESC LIMIT 3").all(chap.novel_id, chap.chapter_num);
  prevChaps.reverse();
  const prevContext = prevChaps.map(c => `第${c.chapter_num}章《${c.title}》：${c.outline}`).join('\n');
  const lastChapEnding = prevChaps.length > 0 ? (prevChaps[prevChaps.length - 1].content || '').slice(-500) : '';
  const lastStatus = prevChaps.length > 0 ? (prevChaps[prevChaps.length - 1].protagonist_status || '') : '';
  const outline = chap.outline || '';
  const needRealm = novel.realm_system && /境界|修为|突破|晋级|修炼|功法|武道|灵力|真气|法力/.test(outline);
  const needOfficial = novel.official_system && /官职|官位|朝廷|官府|升官|任命|封赏|品级|官阶/.test(outline);

  const content = await chatMax([{ role: 'user', content: `你是一位网文大神作家。请根据以下信息写这一章的正文内容。

小说信息：
类型：${novel.genre}，标题：${novel.title}
核心设定：${novel.premise}
世界观：${memory.world || ''}
力量体系：${memory.power_system || ''}${needRealm ? `\n境界体系：${novel.realm_system}` : ''}${needOfficial ? `\n官职体系：${novel.official_system}` : ''}
主角：${memory.protagonist || novel.protagonist}
${lastStatus ? `\n主角当前状态（上章结束时）：\n${lastStatus}\n` : ''}
${prevContext ? '前情摘要：\n' + prevContext + '\n' : ''}${lastChapEnding ? '上一章结尾：\n' + lastChapEnding + '\n' : ''}
本章信息：
第${chap.chapter_num}章《${chap.title}》
本章大纲：${chap.outline}

要求：
- 字数控制在${novel.words_per_chapter}字左右，不要过多也不要过少
- 场景描写、对话、动作各占合理比例，不要偷懒省略
- 符合网文风格，节奏明快，爽点突出
- 人物设定和社会关系必须符合现实逻辑（如势力强弱、职业地位等要合理），不能出现明显不合常识的设定
- 以对话和动作推动情节，减少大段心理描写
- 结尾自然收束，可以留有悬念，但禁止出现任何元叙述、旁白提示或括号说明（如"悬念钩子："、"敬请期待"、"下一章"等）
- 直接输出正文内容，不要标题，不要任何说明，不要括号注释` }], 12000);

  const summary = await chat([{ role: 'user', content: `用一句话（50字以内）概括以下章节内容的核心事件：\n${content.slice(0, 1000)}` }], 100);

  // Auto-extract protagonist status after generation
  const statusPrompt = lastStatus
    ? `根据以下章节正文，在原有主角状态基础上更新主角状态（如有变化）。只输出更新后的状态文本，不要任何说明。\n\n原状态：\n${lastStatus}\n\n本章正文（节选）：\n${content.slice(0, 2000)}`
    : `根据以下章节正文，提取主角当前状态（境界、功法、武技、金手指积分等关键信息）。只输出状态文本，不要任何说明。\n\n本章正文（节选）：\n${content.slice(0, 2000)}`;
  const newStatus = await chat([{ role: 'user', content: statusPrompt }], 300);

  const formatted = content.split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => '\u3000\u3000' + l)
    .join('\n');

  db.prepare("UPDATE ai_novel_chapters SET content = ?, summary = ?, status = 'done', word_count = ?, protagonist_status = ? WHERE id = ?")
    .run(formatted, summary, formatted.length, newStatus, chap.id);
}

const BATCH_SIZE = 20;

async function generateChapterOutlines(novel, vol, userId) {
  const memory = JSON.parse(novel.memory || '{}');
  const prevVols = db.prepare('SELECT volume_num, title, outline FROM ai_novel_volumes WHERE novel_id = ? AND volume_num < ? ORDER BY volume_num').all(vol.novel_id, vol.volume_num);
  const prevContext = prevVols.map(v => `第${v.volume_num}卷《${v.title}》：${v.outline}`).join('\n');
  const total = novel.chapters_per_volume;
  const startNum = (vol.volume_num - 1) * total + 1;
  const insertChap = db.prepare('INSERT INTO ai_novel_chapters (id, novel_id, volume_id, user_id, chapter_num, title, outline, status) VALUES (?,?,?,?,?,?,?,?)');

  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, total);
    const batchStartNum = startNum + batchStart;
    const batchEndNum = startNum + batchEnd - 1;

    // Get last generated chapter as context for continuity
    const lastChap = batchStart > 0
      ? db.prepare('SELECT title, outline FROM ai_novel_chapters WHERE volume_id = ? ORDER BY chapter_num DESC LIMIT 1').get(vol.id)
      : null;

    const text = await chat([{ role: 'user', content: `你是一位网文大神作家。为以下这卷生成章节大纲。

小说信息：
类型：${novel.genre}，标题：${novel.title}
世界观：${memory.world || ''}
力量体系：${memory.power_system || ''}
主角：${memory.protagonist || novel.protagonist}
${prevContext ? '前情提要：\n' + prevContext : ''}

本卷信息：
第${vol.volume_num}卷《${vol.title}》
本卷大纲：${vol.outline}
${lastChap ? `\n上一章（第${batchStartNum - 1}章《${lastChap.title}》）：${lastChap.outline}` : ''}

要求：
- 生成第${batchStartNum}章到第${batchEndNum}章，共${batchEnd - batchStart}个章节
- 每章标题+详细大纲（100-150字），包含：开场情境、核心冲突/事件、爽点/转折、结尾钩子
- 合理分配节奏：铺垫、冲突、高潮、余韵
- 人物设定和社会关系必须符合现实逻辑，不能出现明显不合常识的设定

请用JSON数组返回，每项结构：
{"chapter_num": ${batchStartNum}, "title": "章节标题", "outline": "详细大纲（100-150字）"}
只返回JSON数组，不要其他内容。` }], 4000);

    let outlines = [];
    try { outlines = JSON.parse(text.replace(/```json\n?|\n?```/g, '')); } catch(_) {}
    if (!outlines.length) throw new Error(`第${batchStartNum}-${batchEndNum}章大纲生成为空，请重试`);

    for (const c of outlines) {
      insertChap.run(uuidv4(), vol.novel_id, vol.id, userId, c.chapter_num, c.title, c.outline, 'pending');
    }
  }
}

async function runGenerateVolume(vol, pending) {
  for (const { id } of pending) {
    const volState = db.prepare('SELECT is_paused FROM ai_novel_volumes WHERE id = ?').get(vol.id);
    if (volState?.is_paused) {
      db.prepare("UPDATE ai_novel_chapters SET status = 'pending' WHERE id = ? AND status = 'generating'").run(id);
      return;
    }
    const chap = db.prepare('SELECT * FROM ai_novel_chapters WHERE id = ?').get(id);
    if (!chap) continue;
    db.prepare("UPDATE ai_novel_chapters SET status = 'generating' WHERE id = ?").run(id);
    try {
      await generateChapterContent(chap);
    } catch(err) {
      console.error('[ainovel] generateVolume chapter error:', err.message);
      const msg = err.code === 'QUOTA_EXCEEDED' ? err.message : '生成失败';
      db.prepare("UPDATE ai_novel_chapters SET status = 'error', error_msg = ? WHERE id = ?").run(msg, id);
      if (err.code === 'QUOTA_EXCEEDED') {
        db.prepare("UPDATE ai_novel_volumes SET status = 'error', error_msg = ? WHERE id = ?").run(msg, vol.id);
        return;
      }
    }
  }
  db.prepare("UPDATE ai_novel_volumes SET status = 'done' WHERE id = ?").run(vol.id);
}

exports.retryVolume = async (req, res) => {
  const vol = db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ? AND user_id = ?').get(req.params.vid, req.user.id);
  if (!vol) return res.status(404).json({ error: 'Not found' });
  // Delete existing failed chapter outlines and regenerate
  db.prepare('DELETE FROM ai_novel_chapters WHERE volume_id = ?').run(vol.id);
  db.prepare("UPDATE ai_novel_volumes SET status = 'generating', error_msg = '' WHERE id = ?").run(vol.id);
  res.json({ ok: true });

  (async () => {
    try {
      const novel = db.prepare('SELECT * FROM ai_novels WHERE id = ?').get(vol.novel_id);
      await generateChapterOutlines(novel, vol, vol.user_id);
      db.prepare("UPDATE ai_novel_volumes SET status = 'approved' WHERE id = ?").run(vol.id);
    } catch(err) {
      console.error('[ainovel] retryVolume error:', err.message);
      const msg = err.code === 'QUOTA_EXCEEDED' ? err.message : err.message || '生成失败';
      db.prepare("UPDATE ai_novel_volumes SET status = 'error', error_msg = ? WHERE id = ?").run(msg, vol.id);
    }
  })();
};


exports.generateVolume = async (req, res) => {
  const vol = db.prepare('SELECT * FROM ai_novel_volumes WHERE id = ? AND user_id = ?').get(req.params.vid, req.user.id);
  if (!vol) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE ai_novel_volumes SET is_paused = 0, status = 'generating' WHERE id = ?").run(vol.id);
  const pending = db.prepare("SELECT id FROM ai_novel_chapters WHERE volume_id = ? AND status = 'pending' ORDER BY chapter_num").all(vol.id);
  res.json({ total: pending.length });
  runGenerateVolume(vol, pending);
};
