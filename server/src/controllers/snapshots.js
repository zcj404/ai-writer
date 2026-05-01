const db = require('../db');
const { v4: uuidv4 } = require('uuid');

exports.list = (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, chapter_ids, created_at FROM relation_snapshots WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC'
  ).all(req.params.projectId, req.user.id);
  res.json(rows.map(r => ({ ...r, chapter_ids: JSON.parse(r.chapter_ids) })));
};

exports.get = (req, res) => {
  const row = db.prepare(
    'SELECT * FROM relation_snapshots WHERE id = ? AND project_id = ? AND user_id = ?'
  ).get(req.params.id, req.params.projectId, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const parsed = JSON.parse(row.relations);
  const relations = Array.isArray(parsed) ? parsed : (parsed.relations || []);
  const positions = Array.isArray(parsed) ? {} : (parsed.positions || {});
  const characters = row.characters ? JSON.parse(row.characters) : null;
  res.json({ ...row, chapter_ids: JSON.parse(row.chapter_ids), relations, positions, characters });
};

exports.create = (req, res) => {
  const { name, chapter_ids, relations, positions, characters } = req.body;
  const id = uuidv4();
  const payload = { relations, positions: positions || {} };
  db.prepare(
    'INSERT INTO relation_snapshots (id, project_id, user_id, name, chapter_ids, relations, characters) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.projectId, req.user.id, name, JSON.stringify(chapter_ids), JSON.stringify(payload), characters ? JSON.stringify(characters) : null);
  res.json({ id, name, chapter_ids, created_at: new Date().toISOString() });
};

exports.update = (req, res) => {
  const { relations, name, chapter_ids, positions, characters } = req.body;
  if (name !== undefined) {
    db.prepare('UPDATE relation_snapshots SET name = ? WHERE id = ? AND project_id = ? AND user_id = ?')
      .run(name, req.params.id, req.params.projectId, req.user.id);
  }
  if (relations !== undefined || positions !== undefined) {
    const row = db.prepare('SELECT relations FROM relation_snapshots WHERE id = ? AND project_id = ? AND user_id = ?')
      .get(req.params.id, req.params.projectId, req.user.id);
    const existing = row ? JSON.parse(row.relations) : {};
    const existingRels = Array.isArray(existing) ? existing : (existing.relations || []);
    const existingPos = Array.isArray(existing) ? {} : (existing.positions || {});
    const payload = {
      relations: relations !== undefined ? relations : existingRels,
      positions: positions !== undefined ? positions : existingPos,
    };
    db.prepare('UPDATE relation_snapshots SET relations = ? WHERE id = ? AND project_id = ? AND user_id = ?')
      .run(JSON.stringify(payload), req.params.id, req.params.projectId, req.user.id);
  }
  if (chapter_ids !== undefined) {
    db.prepare('UPDATE relation_snapshots SET chapter_ids = ? WHERE id = ? AND project_id = ? AND user_id = ?')
      .run(JSON.stringify(chapter_ids), req.params.id, req.params.projectId, req.user.id);
  }
  if (characters !== undefined) {
    db.prepare('UPDATE relation_snapshots SET characters = ? WHERE id = ? AND project_id = ? AND user_id = ?')
      .run(JSON.stringify(characters), req.params.id, req.params.projectId, req.user.id);
  }
  res.json({ ok: true });
};

exports.remove = (req, res) => {
  db.prepare(
    'DELETE FROM relation_snapshots WHERE id = ? AND project_id = ? AND user_id = ?'
  ).run(req.params.id, req.params.projectId, req.user.id);
  res.json({ ok: true });
};
