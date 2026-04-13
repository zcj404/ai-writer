# 网文AI写作助手

基于 Claude AI 的网文写作辅助工具。

## 功能
- 📖 项目/章节管理（自动保存）
- ✍️ AI写作辅助：续写、改写、扩写、润色、摘要、校对
- 👤 人物设定管理（AI生成人设）
- 🌍 世界观设定（地理/势力/功法等分类）
- 📋 创作规划：大纲生成、情节灵感、书名简介

## 启动

1. 配置 API Key：
```
server/.env 中填入 ANTHROPIC_API_KEY=your_key
```

2. 启动后端（端口 3001）：
```bash
cd server && npm run dev
```

3. 启动前端（端口 3000）：
```bash
cd client && npm start
```

浏览器访问 http://localhost:3000
