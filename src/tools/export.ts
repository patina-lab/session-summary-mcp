import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SessionRepository } from "../db/repository.js";
import type { Summary, StandupReport, ExportFormat } from "../types.js";
import { summaryToMarkdown, standupToMarkdown } from "../exporter/markdown.js";
import { summaryToJson, standupToJson } from "../exporter/json.js";
import { summarize, generateStandup } from "./summarize.js";

/**
 * Export a summary or standup to a file
 */
export function exportReport(
  repo: SessionRepository,
  params: {
    type: "summary" | "standup";
    format?: ExportFormat;
    outputPath?: string;
    sessionId?: string;
    date?: string;
    projectName?: string;
    includeMetrics?: boolean;
  },
): { content: string; filePath?: string } {
  const format = params.format ?? "markdown";
  let content: string;

  if (params.type === "standup") {
    const standup = generateStandup(repo, {
      date: params.date,
      projectName: params.projectName,
    });
    content = formatStandup(standup, format);
  } else {
    const summary = summarize(repo, {
      sessionId: params.sessionId,
      projectName: params.projectName,
    });
    content = formatSummary(summary, format, params.includeMetrics);
  }

  // Write to file if outputPath provided
  if (params.outputPath) {
    const ext = format === "json" ? ".json" : ".md";
    const filePath = params.outputPath.endsWith(ext)
      ? params.outputPath
      : `${params.outputPath}${ext}`;

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
    return { content, filePath };
  }

  return { content };
}

/**
 * List sessions with optional filters
 */
export function listSessions(
  repo: SessionRepository,
  params?: {
    projectName?: string;
    since?: string;
    until?: string;
    limit?: number;
  },
): Array<{
  id: string;
  projectName: string;
  goal?: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
}> {
  const sessions = repo.listSessions({
    projectName: params?.projectName,
    since: params?.since,
    until: params?.until,
    limit: params?.limit ?? 20,
  });

  return sessions.map((s) => {
    const events = repo.getEvents(s.id);
    return {
      id: s.id,
      projectName: s.projectName,
      goal: s.goal,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      eventCount: events.length,
    };
  });
}

/**
 * Search events across all sessions
 */
export function searchSessions(
  repo: SessionRepository,
  query: string,
  limit?: number,
): Array<{
  eventId: number;
  sessionId: string;
  category: string;
  title: string;
  detail?: string;
  timestamp: string;
}> {
  const events = repo.searchEvents(query, limit ?? 20);
  return events.map((e) => ({
    eventId: e.id!,
    sessionId: e.sessionId,
    category: e.category,
    title: e.title,
    detail: e.detail,
    timestamp: e.timestamp,
  }));
}

// ── Formatters ──

function formatSummary(
  summary: Summary,
  format: ExportFormat,
  includeMetrics?: boolean,
): string {
  if (format === "json") return summaryToJson(summary);
  return summaryToMarkdown(summary, includeMetrics ?? true);
}

function formatStandup(standup: StandupReport, format: ExportFormat): string {
  if (format === "json") return standupToJson(standup);
  return standupToMarkdown(standup);
}
