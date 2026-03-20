import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  Session,
  SessionEvent,
  Summary,
  SessionMetrics,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SessionRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initialize();
  }

  private initialize(): void {
    // Read and execute schema from bundled SQL or inline
    const schema = getSchema();
    this.db.exec(schema);
  }

  // ── Sessions ──

  createSession(session: Session): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_path, project_name, goal, started_at, ended_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.projectPath,
      session.projectName,
      session.goal ?? null,
      session.startedAt,
      session.endedAt ?? null,
      session.metadata ? JSON.stringify(session.metadata) : null,
    );
    return session;
  }

  endSession(sessionId: string, endedAt: string): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET ended_at = ? WHERE id = ?",
    );
    stmt.run(endedAt, sessionId);
  }

  getSession(sessionId: string): Session | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  getActiveSession(): Session | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      )
      .get() as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  deleteSession(sessionId: string): boolean {
    const deleteEvents = this.db.prepare(
      "DELETE FROM events WHERE session_id = ?",
    );
    const deleteSummaries = this.db.prepare(
      "DELETE FROM summaries WHERE session_id = ?",
    );
    const deleteSession = this.db.prepare(
      "DELETE FROM sessions WHERE id = ?",
    );

    const tx = this.db.transaction((id: string) => {
      deleteEvents.run(id);
      deleteSummaries.run(id);
      const result = deleteSession.run(id);
      return result.changes > 0;
    });

    return tx(sessionId);
  }

  listSessions(options?: {
    projectName?: string;
    since?: string;
    until?: string;
    limit?: number;
  }): Session[] {
    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: unknown[] = [];

    if (options?.projectName) {
      sql += " AND project_name = ?";
      params.push(options.projectName);
    }
    if (options?.since) {
      sql += " AND started_at >= ?";
      params.push(options.since);
    }
    if (options?.until) {
      sql += " AND started_at <= ?";
      params.push(options.until);
    }
    sql += " ORDER BY started_at DESC";
    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  // ── Events ──

  addEvent(event: SessionEvent): SessionEvent {
    const stmt = this.db.prepare(`
      INSERT INTO events (session_id, category, title, detail, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      event.sessionId,
      event.category,
      event.title,
      event.detail ?? null,
      event.timestamp,
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
    return { ...event, id: Number(result.lastInsertRowid) };
  }

  addEvents(events: SessionEvent[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (session_id, category, title, detail, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: SessionEvent[]) => {
      for (const e of items) {
        stmt.run(
          e.sessionId,
          e.category,
          e.title,
          e.detail ?? null,
          e.timestamp,
          e.metadata ? JSON.stringify(e.metadata) : null,
        );
      }
    });
    insertMany(events);
  }

  getEvents(sessionId: string): SessionEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC",
      )
      .all(sessionId) as EventRow[];
    return rows.map(rowToEvent);
  }

  getEventsByRange(
    since: string,
    until: string,
    projectName?: string,
  ): SessionEvent[] {
    let sql = `
      SELECT e.* FROM events e
      JOIN sessions s ON e.session_id = s.id
      WHERE e.timestamp >= ? AND e.timestamp <= ?
    `;
    const params: unknown[] = [since, until];

    if (projectName) {
      sql += " AND s.project_name = ?";
      params.push(projectName);
    }
    sql += " ORDER BY e.timestamp ASC";

    const rows = this.db.prepare(sql).all(...params) as EventRow[];
    return rows.map(rowToEvent);
  }

  searchEvents(query: string, limit = 50): SessionEvent[] {
    const rows = this.db
      .prepare(
        `
      SELECT e.* FROM events e
      JOIN events_fts fts ON e.id = fts.rowid
      WHERE events_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `,
      )
      .all(query, limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  // ── Summaries ──

  saveSummary(summary: Summary): Summary {
    const stmt = this.db.prepare(`
      INSERT INTO summaries (session_id, range_start, range_end, objectives, accomplishments, decisions, files_changed, next_steps, blockers, metrics, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      summary.sessionId ?? null,
      summary.rangeStart,
      summary.rangeEnd,
      JSON.stringify(summary.objectives),
      JSON.stringify(summary.accomplishments),
      JSON.stringify(summary.decisions),
      JSON.stringify(summary.filesChanged),
      JSON.stringify(summary.nextSteps),
      JSON.stringify(summary.blockers),
      summary.metrics ? JSON.stringify(summary.metrics) : null,
      summary.generatedAt,
    );
    return { ...summary, id: Number(result.lastInsertRowid) };
  }

  getSummary(sessionId: string): Summary | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM summaries WHERE session_id = ? ORDER BY generated_at DESC LIMIT 1",
      )
      .get(sessionId) as SummaryRow | undefined;
    return row ? rowToSummary(row) : undefined;
  }

  // ── Metrics ──

  getSessionMetrics(sessionId: string): SessionMetrics {
    const events = this.getEvents(sessionId);
    const session = this.getSession(sessionId);

    const startTime = session?.startedAt
      ? new Date(session.startedAt).getTime()
      : 0;
    const endTime = session?.endedAt
      ? new Date(session.endedAt).getTime()
      : Date.now();

    return {
      totalEvents: events.length,
      filesChanged: new Set(
        events
          .filter((e) => e.category === "file_change")
          .map((e) => e.title),
      ).size,
      gitCommits: events.filter((e) => e.category === "git_commit").length,
      errorsEncountered: events.filter((e) => e.category === "error").length,
      errorsResolved: events.filter((e) => e.category === "error_resolved")
        .length,
      durationMinutes: Math.round((endTime - startTime) / 60000),
    };
  }

  close(): void {
    this.db.close();
  }
}

// ── Row types (SQLite returns) ──

interface SessionRow {
  id: string;
  project_path: string;
  project_name: string;
  goal: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: string | null;
}

interface EventRow {
  id: number;
  session_id: string;
  category: string;
  title: string;
  detail: string | null;
  timestamp: string;
  metadata: string | null;
}

interface SummaryRow {
  id: number;
  session_id: string | null;
  range_start: string;
  range_end: string;
  objectives: string;
  accomplishments: string;
  decisions: string;
  files_changed: string;
  next_steps: string;
  blockers: string;
  metrics: string | null;
  generated_at: string;
}

// ── Converters ──

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectPath: row.project_path,
    projectName: row.project_name,
    goal: row.goal ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToEvent(row: EventRow): SessionEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    category: row.category as SessionEvent["category"],
    title: row.title,
    detail: row.detail ?? undefined,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToSummary(row: SummaryRow): Summary {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    objectives: JSON.parse(row.objectives),
    accomplishments: JSON.parse(row.accomplishments),
    decisions: JSON.parse(row.decisions),
    filesChanged: JSON.parse(row.files_changed),
    nextSteps: JSON.parse(row.next_steps),
    blockers: JSON.parse(row.blockers),
    metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
    generatedAt: row.generated_at,
  };
}

// ── Schema loader ──

function getSchema(): string {
  // Try to load from file (development), fallback to inline (bundled)
  try {
    return readFileSync(join(__dirname, "schema.sql"), "utf-8");
  } catch {
    return SCHEMA_SQL;
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  goal TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  objectives TEXT NOT NULL,
  accomplishments TEXT NOT NULL,
  decisions TEXT NOT NULL,
  files_changed TEXT NOT NULL,
  next_steps TEXT NOT NULL,
  blockers TEXT NOT NULL,
  metrics TEXT,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_range ON summaries(range_start, range_end);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title, detail, content=events, content_rowid=id
);
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
`;
