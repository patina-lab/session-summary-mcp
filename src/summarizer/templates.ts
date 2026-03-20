import type {
  SessionEvent,
  Summary,
  StandupReport,
  SessionMetrics,
} from "../types.js";

/**
 * Generate a summary from session events (template-based, no LLM needed)
 */
export function generateSummary(
  sessionId: string | undefined,
  events: SessionEvent[],
  rangeStart: string,
  rangeEnd: string,
  metrics?: SessionMetrics,
): Summary {
  const objectives = extractObjectives(events);
  const accomplishments = extractAccomplishments(events);
  const decisions = extractDecisions(events);
  const filesChanged = extractFilesChanged(events);
  const nextSteps = extractNextSteps(events);
  const blockers = extractBlockers(events);

  return {
    sessionId,
    rangeStart,
    rangeEnd,
    objectives,
    accomplishments,
    decisions,
    filesChanged,
    nextSteps,
    blockers,
    metrics,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a standup report from events across multiple sessions
 */
export function generateStandupFromEvents(
  yesterdayEvents: SessionEvent[],
  todayEvents: SessionEvent[],
  unresolvedBlockers: SessionEvent[],
  projects: string[],
  date: string,
): StandupReport {
  const yesterday = summarizeEventList(yesterdayEvents);
  const today =
    todayEvents.length > 0
      ? summarizeEventList(todayEvents)
      : ["Continue from yesterday's progress"];
  const blockers = unresolvedBlockers.map((e) => e.title);

  return {
    date,
    yesterday: yesterday.length > 0 ? yesterday : ["No tracked activities"],
    today: today,
    blockers,
    projects,
  };
}

// ── Extractors ──

function extractObjectives(events: SessionEvent[]): string[] {
  // Derive objectives from first few user actions and milestones
  const milestones = events.filter((e) => e.category === "milestone");
  if (milestones.length > 0) {
    return milestones.map((e) => e.title);
  }

  // Fallback: derive from early note events
  const notes = events.filter((e) => e.category === "note").slice(0, 3);
  return notes.length > 0
    ? notes.map((e) => e.title)
    : ["Session objectives not explicitly tracked"];
}

function extractAccomplishments(events: SessionEvent[]): string[] {
  const items: string[] = [];

  // Git commits are clear accomplishments
  const commits = events.filter((e) => e.category === "git_commit");
  for (const c of commits) {
    items.push(c.title);
  }

  // Milestones
  const milestones = events.filter((e) => e.category === "milestone");
  for (const m of milestones) {
    items.push(m.title);
  }

  // Resolved errors
  const resolved = events.filter((e) => e.category === "error_resolved");
  for (const r of resolved) {
    items.push(`Fixed: ${r.title}`);
  }

  // File changes summary
  const fileChanges = events.filter((e) => e.category === "file_change");
  if (fileChanges.length > 0) {
    const uniqueFiles = new Set(fileChanges.map((e) => e.title));
    items.push(`Modified ${uniqueFiles.size} file(s)`);
  }

  return items.length > 0 ? items : ["No tracked accomplishments"];
}

function extractDecisions(events: SessionEvent[]): string[] {
  return events
    .filter((e) => e.category === "decision")
    .map((e) => (e.detail ? `${e.title}: ${e.detail}` : e.title));
}

function extractFilesChanged(events: SessionEvent[]): string[] {
  const files = new Set<string>();
  for (const e of events) {
    if (e.category === "file_change") {
      files.add(e.title);
    }
  }
  return [...files];
}

function extractNextSteps(events: SessionEvent[]): string[] {
  // Look for notes mentioning "next", "todo", "plan"
  const nextNotes = events.filter(
    (e) =>
      e.category === "note" &&
      /next|todo|plan|follow.?up/i.test(e.title + (e.detail ?? "")),
  );
  return nextNotes.map((e) => e.title);
}

function extractBlockers(events: SessionEvent[]): string[] {
  // Get blockers that haven't been resolved
  const blockerEvents = events.filter((e) => e.category === "blocker");
  const resolvedBlockers = new Set(
    events
      .filter((e) => e.category === "blocker_resolved")
      .map((e) => e.title),
  );

  return blockerEvents
    .filter((e) => !resolvedBlockers.has(e.title))
    .map((e) => e.title);
}

function summarizeEventList(events: SessionEvent[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  // Prioritize: milestones > commits > decisions > file changes
  const prioritized = [
    ...events.filter((e) => e.category === "milestone"),
    ...events.filter((e) => e.category === "git_commit"),
    ...events.filter((e) => e.category === "decision"),
    ...events.filter((e) => e.category === "error_resolved"),
  ];

  for (const e of prioritized) {
    const key = e.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(e.title);
    }
  }

  // Add file change summary if significant
  const fileChanges = events.filter((e) => e.category === "file_change");
  if (fileChanges.length > 0) {
    const uniqueFiles = new Set(fileChanges.map((e) => e.title));
    items.push(`Modified ${uniqueFiles.size} file(s)`);
  }

  return items;
}
