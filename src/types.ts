// ── Session ──

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  goal?: string;
  startedAt: string; // ISO 8601
  endedAt?: string;
  metadata?: Record<string, unknown>;
}

// ── Event ──

export type EventCategory =
  | "file_change"
  | "git_commit"
  | "error"
  | "error_resolved"
  | "decision"
  | "milestone"
  | "note"
  | "tool_call"
  | "blocker"
  | "blocker_resolved";

export interface SessionEvent {
  id?: number;
  sessionId: string;
  category: EventCategory;
  title: string;
  detail?: string;
  timestamp: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ── Summary ──

export interface Summary {
  id?: number;
  sessionId?: string;
  rangeStart: string; // ISO 8601
  rangeEnd: string;
  objectives: string[];
  accomplishments: string[];
  decisions: string[];
  filesChanged: string[];
  nextSteps: string[];
  blockers: string[];
  metrics?: SessionMetrics;
  generatedAt: string;
}

export interface SessionMetrics {
  totalEvents: number;
  filesChanged: number;
  gitCommits: number;
  errorsEncountered: number;
  errorsResolved: number;
  durationMinutes: number;
}

// ── Standup ──

export interface StandupReport {
  date: string;
  yesterday: string[];
  today: string[];
  blockers: string[];
  projects: string[];
}

// ── Export ──

export type ExportFormat = "markdown" | "json";

export interface ExportOptions {
  format: ExportFormat;
  outputPath?: string;
  includeMetrics?: boolean;
}

// ── Claude Code JSONL Parsing ──

export interface ClaudeMessage {
  type: "user" | "assistant" | "progress" | "file-history-snapshot";
  message?: {
    role?: string;
    content?: string | ClaudeContentBlock[];
    model?: string;
    usage?: ClaudeUsage;
    stop_reason?: string;
  };
  timestamp: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  uuid?: string;
  permissionMode?: string;
  data?: Record<string, unknown>;
}

export interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  content?: string | ClaudeContentBlock[];
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ── Git ──

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

// ── Config ──

export interface ServerConfig {
  dbPath: string;
  claudeDataDir: string;
  defaultProjectPath?: string;
}
