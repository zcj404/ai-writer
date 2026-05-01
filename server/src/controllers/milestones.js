const db = require('../db');
const { v4: uuid } = require('uuid');

exports.list = (req, res) => {
  const rows = db.prepare('SELECT * FROM milestones WHERE project_id=? AND user_id=? ORDER BY order_num').all(req.params.projectId, req.user.id);
  res.json(rows);
};

exports.create = (req, res) => {
  const { title, description = '', tag = null, volume_id = null, target_chapter = null, order_num = 0 } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO milestones (id,project_id,user_id,title,description,tag,volume_id,target_chapter,order_num) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.params.projectId, req.user.id, title, description, tag, volume_id, target_chapter, order_num);
  res.json(db.prepare('SELECT * FROM milestones WHERE id=?').get(id));
};

exports.update = (req, res) => {
  const { title, description, tag, volume_id, target_chapter, order_num } = req.body;
  const m = db.prepare('SELECT * FROM milestones WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE milestones SET title=?,description=?,tag=?,volume_id=?,target_chapter=?,order_num=? WHERE id=?').run(
    title ?? m.title, description ?? m.description,
    tag !== undefined ? tag : m.tag,
    volume_id !== undefined ? volume_id : m.volume_id,
    target_chapter !== undefined ? target_chapter : m.target_chapter,
    order_num ?? m.order_num, req.params.id
  );
  res.json(db.prepare('SELECT * FROM milestones WHERE id=?').get(req.params.id));
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM milestones WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
};
