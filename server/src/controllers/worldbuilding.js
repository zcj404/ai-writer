const { v4: uuidv4 } = require('uuid');
const db = require('../db');

exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM worldbuilding WHERE project_id = ? AND user_id = ? ORDER BY category, created_at').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.create = (req, res) => {
  const { category, title, content } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO worldbuilding (id, project_id, user_id, category, title, content) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.params.projectId, req.user.id, category, title, content);
  res.json(db.prepare('SELECT * FROM worldbuilding WHERE id = ?').get(id));
};

exports.update = (req, res) => {
  const { category, title, content } = req.body;
  db.prepare('UPDATE worldbuilding SET category=?, title=?, content=? WHERE id=? AND project_id=? AND user_id=?').run(category, title, content, req.params.id, req.params.projectId, req.user.id);
  res.json(db.prepare('SELECT * FROM worldbuilding WHERE id = ?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM worldbuilding WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ success: true });
};
