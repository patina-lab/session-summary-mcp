-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  goal TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  metadata TEXT -- JSON string
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT NOT NULL,
  metadata TEXT, -- JSON string
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

-- Summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  objectives TEXT NOT NULL, -- JSON array
  accomplishments TEXT NOT NULL, -- JSON array
  decisions TEXT NOT NULL, -- JSON array
  files_changed TEXT NOT NULL, -- JSON array
  next_steps TEXT NOT NULL, -- JSON array
  blockers TEXT NOT NULL, -- JSON array
  metrics TEXT, -- JSON string
  generated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_range ON summaries(range_start, range_end);

-- FTS5 full-text search on events
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title,
  detail,
  content=events,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, detail) VALUES (new.id, new.title, new.detail);
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, detail) VALUES('delete', old.id, old.title, old.detail);
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, detail) VALUES('delete', old.id, old.title, old.detail);
  INSERT INTO events_fts(rowid, title, detail) VALUES (new.id, new.title, new.detail);
END;
