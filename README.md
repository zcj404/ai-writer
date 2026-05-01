# 墨笔 AI · 网文创作助手

基于阿里云 Qwen 大模型的网文写作平台，支持自主创作辅助和 AI 全自动写作两种模式。

## 功能概览

### 自主创作模式（作者主写，AI 辅助）
- **章节管理**：分卷分章，自动保存，支持字数统计
- **AI 写作辅助**：续写、改写、扩写、润色、摘要、校对（流式输出）
- **人物管理**：人设生成、AI 头像生成（wan2.7-image）、人物关系图谱
- **世界观设定**：地理、势力、功法、道具等分类管理
- **创作规划**：分卷大纲、情节钉、里程碑管理
- **灵感工坊**：情节走向、冲突设计、转折反转、章节钩子、写作诊断

### AI 创作模式（AI 主写，作者把控）
- 输入标题、类型、核心设定、主角，AI 自动生成世界观和人物设定
- AI 规划多卷大纲，作者可审核修改后一键审批
- 审批后自动生成全卷章节细纲（每批 20 章）
- 支持逐章生成正文，可暂停/继续，支持断点续写
- 章节对话：与 AI 讨论并修改细纲或正文，一键应用修改
- 世界观/大纲对话：与 AI 协作调整设定，支持一键应用提案
- 主角状态自动追踪（境界、功法、金手指等）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express |
| 数据库 | SQLite（better-sqlite3） |
| AI 服务 | 阿里云 DashScope（qwen-turbo / qwen-max / qwen3.6-max-preview / wan2.7-image） |

## 快速启动

### 1. 安装依赖
```bash
npm run install:all
```

### 2. 配置 API Key
```bash
# 在 server/.env 中填入：
DASHSCOPE_API_KEY=你的阿里云DashScope密钥
JWT_SECRET=任意随机字符串
```

> DashScope 密钥在 [阿里云百炼控制台](https://bailian.console.aliyun.com/) 获取

### 3. 启动开发服务
```bash
npm run dev
```

浏览器访问 http://localhost:3000

## 部署到阿里云

详见 `部署说明.txt`，包含 GitHub 推送和服务器完整部署步骤。

## 项目结构

```
├── client/          # React 前端
│   └── src/
│       ├── components/   # 页面组件
│       ├── api/          # API 封装
│       └── types/        # TypeScript 类型
├── server/          # Node.js 后端
│   └── src/
│       ├── controllers/  # 业务逻辑（含 AI 提示词）
│       ├── routes/       # API 路由
│       └── db.js         # SQLite 初始化
├── AI提示词整理.txt  # 所有 AI 提示词汇总
└── 部署说明.txt      # 部署操作步骤
```

## 注意事项

- 免费版用户每日 20 次 AI 调用
- `server/data.db` 为本地数据库，不纳入 git，请定期备份
- AI 流式输出依赖 SSE，Nginx 部署时需关闭 `proxy_buffering`
