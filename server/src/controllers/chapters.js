const { v4: uuidv4 } = require('uuid');
const db = require('../db');

exports.list = (req, res) => {
  const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? AND user_id = ? ORDER BY order_num').all(req.params.projectId, req.user.id);
  res.json(chapters);
};

exports.create = (req, res) => {
  const { title, content, order_num } = req.body;
  const id = uuidv4();
  const wordCount = (content || '').replace(/\s/g, '').length;
  db.prepare('INSERT INTO chapters (id, project_id, user_id, title, content, order_num, word_count) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.projectId, req.user.id, title, content || '', order_num || 0, wordCount);
  db.prepare('UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(req.params.projectId, req.user.id);
  res.json(db.prepare('SELECT * FROM chapters WHERE id = ?').get(id));
};

exports.get = (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND project_id = ? AND user_id = ?').get(req.params.id, req.params.projectId, req.user.id);
  if (!chapter) return res.status(404).json({ error: 'Not found' });
  res.json(chapter);
};

exports.update = (req, res) => {
  const { title, content, order_num } = req.body;
  const wordCount = (content || '').replace(/\s/g, '').length;
  db.prepare('UPDATE chapters SET title=?, content=?, order_num=?, word_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=? AND user_id=?').run(title, content, order_num, wordCount, req.params.id, req.params.projectId, req.user.id);
  db.prepare('UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(req.params.projectId, req.user.id);
  res.json(db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM chapters WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ success: true });
};
