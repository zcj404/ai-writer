const { v4: uuidv4 } = require('uuid');
const db = require('../db');

exports.list = (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json(projects);
};

exports.create = (req, res) => {
  const { title, description, genre } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, user_id, title, description, genre) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, title, description, genre);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
};

exports.get = (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
};

exports.update = (req, res) => {
  const { title, description, genre, synopsis } = req.body;
  const p = db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE projects SET title=?, description=?, genre=?, synopsis=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(
    title ?? p.title, description ?? p.description, genre ?? p.genre, synopsis !== undefined ? synopsis : p.synopsis,
    req.params.id, req.user.id
  );
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
};
