const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'novel-ai-secret-2024';

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token无效或已过期' });
  }
};
