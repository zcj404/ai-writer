const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data.db'));

// 开启外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS volumes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    order_num INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT,
    plan TEXT DEFAULT 'free',
    ai_calls_today INTEGER DEFAULT 0,
    ai_calls_reset_date TEXT DEFAULT (date('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    order_num INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    personality TEXT,
    background TEXT,
    appearance TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS worldbuilding (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS relation_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    chapter_ids TEXT NOT NULL,
    relations TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

try { db.exec(`ALTER TABLE chapters ADD COLUMN volume_id TEXT`); } catch(_) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS chapter_summaries (
  chapter_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch(_) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  volume_id TEXT,
  order_num INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
)`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN avatar TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN age_group TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN ethnicity TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN gender TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN novel_category TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE characters ADD COLUMN relations TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE relation_snapshots ADD COLUMN characters TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE milestones ADD COLUMN tag TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE milestones ADD COLUMN target_chapter TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN synopsis TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE worldbuilding ADD COLUMN parent_id TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE worldbuilding ADD COLUMN relations TEXT DEFAULT '[]'`); } catch(_) {}
try { db.exec(`ALTER TABLE worldbuilding ADD COLUMN position TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE worldbuilding ADD COLUMN polygon TEXT`); } catch(_) {}
try { db.exec(`ALTER TABLE worldbuilding ADD COLUMN color TEXT`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS map_exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
)`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS ai_novels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  premise TEXT NOT NULL,
  protagonist TEXT NOT NULL,
  total_volumes INTEGER DEFAULT 5,
  chapters_per_volume INTEGER DEFAULT 140,
  words_per_chapter INTEGER DEFAULT 3000,
  memory TEXT DEFAULT '{}',
  status TEXT DEFAULT 'outline',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS ai_novel_volumes (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  volume_num INTEGER NOT NULL,
  title TEXT NOT NULL,
  outline TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES ai_novels(id) ON DELETE CASCADE
)`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS ai_novel_chapters (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  volume_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chapter_num INTEGER NOT NULL,
  title TEXT NOT NULL,
  outline TEXT NOT NULL,
  content TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES ai_novels(id) ON DELETE CASCADE,
  FOREIGN KEY (volume_id) REFERENCES ai_novel_volumes(id) ON DELETE CASCADE
)`); } catch(_) {}

try { db.exec(`ALTER TABLE ai_novel_chapters ADD COLUMN error_msg TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novel_volumes ADD COLUMN error_msg TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novels ADD COLUMN error_msg TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novel_chapters ADD COLUMN word_count INTEGER DEFAULT 0`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novel_volumes ADD COLUMN is_paused INTEGER DEFAULT 0`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novel_chapters ADD COLUMN content_status TEXT DEFAULT 'pending'`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novels ADD COLUMN realm_system TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novels ADD COLUMN official_system TEXT DEFAULT ''`); } catch(_) {}
try { db.exec(`ALTER TABLE ai_novel_chapters ADD COLUMN protagonist_status TEXT DEFAULT ''`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS ai_novel_chats (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  history TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES ai_novels(id) ON DELETE CASCADE
)`); } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS ai_chapter_chats (
  chapter_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  history TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES ai_novel_chapters(id) ON DELETE CASCADE
)`); } catch(_) {}

module.exports = db;
