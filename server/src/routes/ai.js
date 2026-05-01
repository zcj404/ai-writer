const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkAiLimit } = require('../controllers/users');
const c = require('../controllers/ai');
const inspirationConfig = require('../config/inspiration.json');
const db = require('../db');

router.get('/inspiration-config', auth, (req, res) => res.json(inspirationConfig));
router.post('/assist', auth, checkAiLimit, c.assist);
router.post('/stream', auth, checkAiLimit, c.stream);
router.post('/generate-avatar', auth, c.generateAvatar);

// 摘要缓存
router.get('/summary/:chapterId', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM chapter_summaries WHERE chapter_id = ? AND user_id = ?')
    .get(req.params.chapterId, req.user.id);
  res.json(row || null);
});

router.post('/summary/:chapterId', auth, (req, res) => {
  const { summary, content_length } = req.body;
  db.prepare(`INSERT INTO chapter_summaries (chapter_id, user_id, summary, content_length, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chapter_id) DO UPDATE SET summary=excluded.summary, content_length=excluded.content_length, updated_at=CURRENT_TIMESTAMP`)
    .run(req.params.chapterId, req.user.id, summary, content_length);
  res.json({ ok: true });
});

router.delete('/summary/:chapterId', auth, (req, res) => {
  db.prepare('DELETE FROM chapter_summaries WHERE chapter_id = ? AND user_id = ?')
    .run(req.params.chapterId, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
