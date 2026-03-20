import type { SessionRepository } from "../db/repository.js";
import type { Summary, StandupReport } from "../types.js";
import {
  generateSummary,
  generateStandupFromEvents,
} from "../summarizer/templates.js";

/**
 * Summarize a single session or a date range
 */
export function summarize(
  repo: SessionRepository,
  params: {
    sessionId?: string;
    since?: string;
    until?: string;
    projectName?: string;
  },
): Summary {
  const now = new Date().toISOString();

  if (params.sessionId) {
    // Single session summary
    const events = repo.getEvents(params.sessionId);
    const session = repo.getSession(params.sessionId);
    const metrics = repo.getSessionMetrics(params.sessionId);

    return generateSummary(
      params.sessionId,
      events,
      session?.startedAt ?? now,
      session?.endedAt ?? now,
      metrics,
    );
  }

  // Date range summary
  const since = params.since ?? todayStart();
  const until = params.until ?? now;
  const events = repo.getEventsByRange(since, until, params.projectName);

  return generateSummary(undefined, events, since, until);
}

/**
 * Generate a standup report
 */
export function generateStandup(
  repo: SessionRepository,
  params?: {
    date?: string; // YYYY-MM-DD, defaults to today
    projectName?: string;
  },
): StandupReport {
  const targetDate = params?.date ?? todayDate();
  const yesterday = getPreviousWorkday(targetDate);

  const yesterdayStart = `${yesterday}T00:00:00.000Z`;
  const yesterdayEnd = `${yesterday}T23:59:59.999Z`;
  const todayStartStr = `${targetDate}T00:00:00.000Z`;
  const todayEndStr = `${targetDate}T23:59:59.999Z`;

  const yesterdayEvents = repo.getEventsByRange(
    yesterdayStart,
    yesterdayEnd,
    params?.projectName,
  );
  const todayEvents = repo.getEventsByRange(
    todayStartStr,
    todayEndStr,
    params?.projectName,
  );

  // Collect all unique project names from recent sessions
  const recentSessions = repo.listSessions({
    since: yesterdayStart,
    until: todayEndStr,
    projectName: params?.projectName,
  });
  const projects = [...new Set(recentSessions.map((s) => s.projectName))];

  // Find unresolved blockers from recent events
  const allEvents = [...yesterdayEvents, ...todayEvents];
  const unresolvedBlockers = allEvents.filter(
    (e) => e.category === "blocker",
  );
  const resolvedTitles = new Set(
    allEvents
      .filter((e) => e.category === "blocker_resolved")
      .map((e) => e.title),
  );
  const activeBlockers = unresolvedBlockers.filter(
    (e) => !resolvedTitles.has(e.title),
  );

  return generateStandupFromEvents(
    yesterdayEvents,
    todayEvents,
    activeBlockers,
    projects,
    targetDate,
  );
}

// ── Helpers ──

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getPreviousWorkday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = d.getDay();

  // Skip weekends: Monday → Friday, Sunday → Friday
  if (dayOfWeek === 1) {
    d.setDate(d.getDate() - 3); // Monday → Friday
  } else if (dayOfWeek === 0) {
    d.setDate(d.getDate() - 2); // Sunday → Friday
  } else {
    d.setDate(d.getDate() - 1);
  }

  return d.toISOString().split("T")[0];
}
