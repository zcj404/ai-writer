const { v4: uuidv4 } = require('uuid');
const db = require('../db');

exports.list = (req, res) => {
  const { all } = req.query;
  const rows = all
    ? db.prepare('SELECT * FROM characters WHERE project_id = ? AND user_id = ? ORDER BY created_at').all(req.params.projectId, req.user.id)
    : db.prepare('SELECT * FROM characters WHERE project_id = ? AND user_id = ? AND is_main = 1 ORDER BY created_at').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.create = (req, res) => {
  const { name, role, description, personality, background, appearance, avatar, age_group, ethnicity, gender, novel_category, relations, is_main } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO characters (id, project_id, user_id, name, role, description, personality, background, appearance, avatar, age_group, ethnicity, gender, novel_category, relations, is_main) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.params.projectId, req.user.id, name, role, description, personality, background, appearance, avatar, age_group, ethnicity, gender, novel_category, relations, is_main ? 1 : 0);
  res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(id));
};

exports.update = (req, res) => {
  const { name, role, description, personality, background, appearance, avatar, age_group, ethnicity, gender, novel_category, relations } = req.body;
  db.prepare('UPDATE characters SET name=?, role=?, description=?, personality=?, background=?, appearance=?, avatar=?, age_group=?, ethnicity=?, gender=?, novel_category=?, relations=? WHERE id=? AND project_id=? AND user_id=?').run(name, role, description, personality, background, appearance, avatar, age_group, ethnicity, gender, novel_category, relations, req.params.id, req.params.projectId, req.user.id);
  res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM characters WHERE id = ? AND project_id = ? AND user_id = ?').run(req.params.id, req.params.projectId, req.user.id);
  res.json({ success: true });
};
