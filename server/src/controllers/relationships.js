const db = require('../db');
const { v4: uuidv4 } = require('uuid');

exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM relationships WHERE project_id = ?').all(req.params.projectId);
  res.json(rows);
};

exports.batchSave = (req, res) => {
  const { projectId } = req.params;
  const { relations } = req.body;
  const userId = req.user.id;
  const run = db.transaction(() => {
    db.prepare('DELETE FROM relationships WHERE project_id = ?').run(projectId);
    for (const r of relations) {
      db.prepare('INSERT INTO relationships (id, project_id, user_id, source_id, target_id, label) VALUES (?,?,?,?,?,?)')
        .run(uuidv4(), projectId, userId, r.source_id, r.target_id, r.label || '');
    }
  });
  run();
  res.json({ ok: true });
};

exports.create = (req, res) => {
  const { source_id, target_id, label } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO relationships (id, project_id, user_id, source_id, target_id, label) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.projectId, req.user.id, source_id, target_id, label || '');
  res.json({ id, source_id, target_id, label: label || '' });
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM relationships WHERE id = ? AND project_id = ?').run(req.params.id, req.params.projectId);
  res.json({ ok: true });
};
