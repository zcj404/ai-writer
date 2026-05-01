const db = require('../db');
const { v4: uuidv4 } = require('uuid');

exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM volumes WHERE project_id = ? AND user_id = ? ORDER BY order_num').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.create = (req, res) => {
  const { name, order_num } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO volumes (id, project_id, user_id, name, order_num) VALUES (?, ?, ?, ?, ?)').run(id, req.params.projectId, req.user.id, name, order_num ?? 0);
  res.json({ id, project_id: req.params.projectId, name, order_num: order_num ?? 0 });
};

exports.update = (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE volumes SET name = ? WHERE id = ? AND project_id = ? AND user_id = ?').run(name, req.params.id, req.params.projectId, req.user.id);
  res.json({ ok: true });
};

exports.remove = (req, res) => {
  db.prepare('UPDATE chapters SET volume_id = NULL WHERE volume_id = ? AND project_id = ?').run(req.params.id, req.params.projectId);
  db.prepare('DELETE FROM volumes WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ ok: true });
};
