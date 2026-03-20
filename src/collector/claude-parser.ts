import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type {
  ClaudeMessage,
  ClaudeContentBlock,
  SessionEvent,
  Session,
} from "../types.js";

/**
 * Parse Claude Code JSONL session files from ~/.claude/projects/
 */
export function parseClaudeSession(jsonlPath: string): ClaudeMessage[] {
  const content = readFileSync(jsonlPath, "utf-8");
  const messages: ClaudeMessage[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line) as ClaudeMessage);
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

/**
 * Extract session events from parsed Claude messages
 */
export function extractEvents(
  sessionId: string,
  messages: ClaudeMessage[],
): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (const msg of messages) {
    if (msg.type === "assistant" && msg.message?.content) {
      const blocks = normalizeContent(msg.message.content);
      for (const block of blocks) {
        // Track tool calls
        if (block.type === "tool_use" && block.name) {
          const toolEvent = extractToolEvent(sessionId, msg, block);
          if (toolEvent) events.push(toolEvent);
        }
      }
    }

    // Track hook events (session lifecycle)
    if (msg.type === "progress" && msg.data) {
      const hookEvent = extractHookEvent(sessionId, msg);
      if (hookEvent) events.push(hookEvent);
    }
  }

  return events;
}

/**
 * Build a Session object from parsed messages
 */
export function buildSessionFromMessages(
  sessionId: string,
  messages: ClaudeMessage[],
  projectPath: string,
): Session {
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];

  // Extract project name from path
  const projectName = basename(projectPath).replace(/^-/, "");

  // Try to extract goal from first user message
  let goal: string | undefined;
  for (const msg of messages) {
    if (msg.type === "user" && msg.message?.content) {
      const text =
        typeof msg.message.content === "string"
          ? msg.message.content
          : extractText(msg.message.content as ClaudeContentBlock[]);
      if (text) {
        goal = text.slice(0, 200);
        break;
      }
    }
  }

  return {
    id: sessionId,
    projectPath,
    projectName,
    goal,
    startedAt: firstMsg?.timestamp ?? new Date().toISOString(),
    endedAt: lastMsg?.timestamp,
  };
}

/**
 * Discover all session JSONL files in the Claude data directory
 */
export function discoverSessions(claudeDataDir: string): SessionFileInfo[] {
  const projectsDir = join(claudeDataDir, "projects");
  const results: SessionFileInfo[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(projectsDir);
  } catch {
    return results;
  }

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);
    let entries: string[];
    try {
      const stat = statSync(projPath);
      if (!stat.isDirectory()) continue;
      entries = readdirSync(projPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = join(projPath, entry);
      const sessionId = entry.replace(".jsonl", "");

      try {
        const stat = statSync(filePath);
        results.push({
          sessionId,
          filePath,
          projectDir: projDir,
          projectPath: decodeProjectPath(projDir),
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }
  }

  return results.sort(
    (a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
  );
}

/**
 * Calculate token usage from a session's messages
 */
export function calculateTokenUsage(messages: ClaudeMessage[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;

  for (const msg of messages) {
    if (msg.type === "assistant" && msg.message?.usage) {
      const usage = msg.message.usage;
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      cacheCreation += usage.cache_creation_input_tokens ?? 0;
      cacheRead += usage.cache_read_input_tokens ?? 0;
    }
  }

  return { inputTokens, outputTokens, cacheCreation, cacheRead };
}

// ── Helpers ──

function normalizeContent(
  content: string | ClaudeContentBlock[],
): ClaudeContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

function extractText(blocks: ClaudeContentBlock[]): string {
  return blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");
}

function extractToolEvent(
  sessionId: string,
  msg: ClaudeMessage,
  block: ClaudeContentBlock,
): SessionEvent | null {
  const name = block.name!;

  // File operations
  if (name === "Write" || name === "Edit") {
    const filePath =
      (block.input?.file_path as string) ??
      (block.input?.path as string) ??
      "unknown";
    return {
      sessionId,
      category: "file_change",
      title: basename(filePath),
      detail: `${name}: ${filePath}`,
      timestamp: msg.timestamp,
      metadata: { tool: name, path: filePath },
    };
  }

  // Git operations
  if (name === "Bash" && typeof block.input?.command === "string") {
    const cmd = block.input.command;
    if (cmd.startsWith("git commit")) {
      const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
      return {
        sessionId,
        category: "git_commit",
        title: msgMatch?.[1] ?? "git commit",
        detail: cmd,
        timestamp: msg.timestamp,
      };
    }
  }

  // Skip noisy tool calls
  if (["Read", "Glob", "Grep", "Bash"].includes(name)) return null;

  return {
    sessionId,
    category: "tool_call",
    title: name,
    detail: JSON.stringify(block.input ?? {}).slice(0, 500),
    timestamp: msg.timestamp,
    metadata: { tool: name },
  };
}

function extractHookEvent(
  sessionId: string,
  msg: ClaudeMessage,
): SessionEvent | null {
  const hookEvent = msg.data?.hookEvent as string | undefined;
  if (!hookEvent) return null;

  return {
    sessionId,
    category: "note",
    title: `Hook: ${hookEvent}`,
    detail: msg.data?.hookName as string | undefined,
    timestamp: msg.timestamp,
  };
}

/**
 * Decode project directory name back to path
 * e.g., "-Users-user-Company-claude" → "/Users/user/Company/claude"
 */
function decodeProjectPath(dirName: string): string {
  // Replace leading dash and subsequent dashes with path separators
  return "/" + dirName.replace(/^-/, "").replace(/-/g, "/");
}

// ── Types ──

export interface SessionFileInfo {
  sessionId: string;
  filePath: string;
  projectDir: string;
  projectPath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
}
