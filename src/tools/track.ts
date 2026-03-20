import { randomUUID } from "node:crypto";
import type { SessionRepository } from "../db/repository.js";
import type { Session, SessionEvent, EventCategory } from "../types.js";
import {
  collectGitCommits,
  commitsToEvents,
} from "../collector/git-collector.js";
import {
  discoverSessions,
  parseClaudeSession,
  extractEvents,
  buildSessionFromMessages,
} from "../collector/claude-parser.js";

/**
 * Start a new tracking session
 */
export function startSession(
  repo: SessionRepository,
  params: {
    projectPath?: string;
    projectName?: string;
    goal?: string;
  },
): Session {
  const session: Session = {
    id: randomUUID(),
    projectPath: params.projectPath ?? process.cwd(),
    projectName:
      params.projectName ??
      params.projectPath?.split("/").pop() ??
      "unknown",
    goal: params.goal,
    startedAt: new Date().toISOString(),
  };

  return repo.createSession(session);
}

/**
 * End a tracking session
 */
export function endSession(
  repo: SessionRepository,
  sessionId: string,
): void {
  repo.endSession(sessionId, new Date().toISOString());
}

/**
 * Track a single event in the current session
 */
export function trackEvent(
  repo: SessionRepository,
  params: {
    sessionId: string;
    category: EventCategory;
    title: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  },
): SessionEvent {
  return repo.addEvent({
    sessionId: params.sessionId,
    category: params.category,
    title: params.title,
    detail: params.detail,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  });
}

/**
 * Import Claude Code session data from JSONL files
 */
export function importClaudeSessions(
  repo: SessionRepository,
  claudeDataDir: string,
  options?: {
    since?: string;
    projectFilter?: string;
    limit?: number;
  },
): { imported: number; skipped: number } {
  const sessionFiles = discoverSessions(claudeDataDir);
  let imported = 0;
  let skipped = 0;

  for (const file of sessionFiles) {
    // Apply filters
    if (options?.limit && imported >= options.limit) break;
    if (
      options?.projectFilter &&
      !file.projectPath
        .toLowerCase()
        .includes(options.projectFilter.toLowerCase())
    ) {
      continue;
    }
    if (
      options?.since &&
      new Date(file.modifiedAt) < new Date(options.since)
    ) {
      continue;
    }

    // Skip if already imported
    const existing = repo.getSession(file.sessionId);
    if (existing) {
      skipped++;
      continue;
    }

    try {
      const messages = parseClaudeSession(file.filePath);
      if (messages.length === 0) {
        skipped++;
        continue;
      }

      const session = buildSessionFromMessages(
        file.sessionId,
        messages,
        file.projectPath,
      );
      repo.createSession(session);

      const events = extractEvents(file.sessionId, messages);
      if (events.length > 0) {
        repo.addEvents(events);
      }

      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped };
}

/**
 * Import git commits for a session
 */
export function importGitCommits(
  repo: SessionRepository,
  sessionId: string,
  repoPath: string,
  since?: string,
  until?: string,
): number {
  const commits = collectGitCommits(repoPath, since, until);
  if (commits.length === 0) return 0;

  const events = commitsToEvents(sessionId, commits);
  repo.addEvents(events);
  return events.length;
}
