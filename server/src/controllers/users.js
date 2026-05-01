const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'novel-ai-secret-2024';
const FREE_DAILY_LIMIT = 20;

exports.register = async (req, res) => {
  const { email, password, nickname } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码必填' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(400).json({ error: '邮箱已注册' });
  }
  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, nickname) VALUES (?, ?, ?, ?)').run(id, email, password_hash, nickname || email.split('@')[0]);
  const user = db.prepare('SELECT id, email, nickname, plan FROM users WHERE id = ?').get(id);
  const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
  res.json({ token, user });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname, plan: user.plan } });
};

exports.me = (req, res) => {
  const user = db.prepare('SELECT id, email, nickname, plan, ai_calls_today, ai_calls_reset_date FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
};

exports.checkAiLimit = (req, res, next) => {
  const user = db.prepare('SELECT plan, ai_calls_today, ai_calls_reset_date FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  // pro 及以上无限次数
  if (user.plan !== 'free') { next(); return; }
  const today = new Date().toISOString().split('T')[0];
  if (user.ai_calls_reset_date !== today) {
    db.prepare('UPDATE users SET ai_calls_today = 0, ai_calls_reset_date = ? WHERE id = ?').run(today, req.user.id);
    user.ai_calls_today = 0;
  }
  if (user.ai_calls_today >= FREE_DAILY_LIMIT) {
    return res.status(429).json({
      error: `今日 AI 次数已用完（免费版每日 ${FREE_DAILY_LIMIT} 次），明日自动重置`,
      used: user.ai_calls_today,
      limit: FREE_DAILY_LIMIT,
    });
  }
  db.prepare('UPDATE users SET ai_calls_today = ai_calls_today + 1 WHERE id = ?').run(req.user.id);
  next();
};
