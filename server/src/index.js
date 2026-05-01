require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:projectId/chapters', require('./routes/chapters'));
app.use('/api/projects/:projectId/volumes', require('./routes/volumes'));
app.use('/api/projects/:projectId/characters', require('./routes/characters'));
app.use('/api/projects/:projectId/worldbuilding', require('./routes/worldbuilding'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/projects/:projectId/relationships', require('./routes/relationships'));
app.use('/api/projects/:projectId/snapshots', require('./routes/snapshots'));
app.use('/api/projects/:projectId/milestones', require('./routes/milestones'));
app.use('/api/projects/:projectId/mapexports', require('./routes/mapexports'));
app.use('/api/ainovels', require('./routes/ainovels'));

// 托管前端静态文件（生产环境）
const clientBuild = path.join(__dirname, '../../client/build');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
