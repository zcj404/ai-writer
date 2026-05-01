const { v4: uuidv4 } = require('uuid');
const db = require('../db');

exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM worldbuilding WHERE project_id = ? AND user_id = ? ORDER BY category, created_at').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.create = (req, res) => {
  const { category, title, content, parent_id, relations, position, polygon, color } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO worldbuilding (id, project_id, user_id, category, title, content, parent_id, relations, position, polygon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, req.params.projectId, req.user.id, category, title, content,
    parent_id || null, JSON.stringify(relations || []),
    position ? JSON.stringify(position) : null,
    polygon ? JSON.stringify(polygon) : null,
    color || null
  );
  res.json(db.prepare('SELECT * FROM worldbuilding WHERE id = ?').get(id));
};

exports.update = (req, res) => {
  const { category, title, content, parent_id, relations, position, polygon, color } = req.body;
  const cur = db.prepare('SELECT * FROM worldbuilding WHERE id=? AND project_id=? AND user_id=?').get(req.params.id, req.params.projectId, req.user.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE worldbuilding SET category=?, title=?, content=?, parent_id=?, relations=?, position=?, polygon=?, color=? WHERE id=? AND project_id=? AND user_id=?').run(
    category ?? cur.category, title ?? cur.title, content ?? cur.content,
    parent_id !== undefined ? (parent_id || null) : cur.parent_id,
    relations !== undefined ? JSON.stringify(relations) : cur.relations,
    position !== undefined ? JSON.stringify(position) : cur.position,
    polygon !== undefined ? JSON.stringify(polygon) : cur.polygon,
    color !== undefined ? color : cur.color,
    req.params.id, req.params.projectId, req.user.id
  );
  res.json(db.prepare('SELECT * FROM worldbuilding WHERE id = ?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM worldbuilding WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ success: true });
};
