import type { Summary, StandupReport, SessionMetrics } from "../types.js";

/**
 * Export a summary to markdown format
 */
export function summaryToMarkdown(
  summary: Summary,
  includeMetrics = true,
): string {
  const lines: string[] = [];

  lines.push(`# Session Summary`);
  lines.push("");
  lines.push(
    `**Period**: ${formatDate(summary.rangeStart)} — ${formatDate(summary.rangeEnd)}`,
  );
  if (summary.sessionId) {
    lines.push(`**Session**: \`${summary.sessionId}\``);
  }
  lines.push(`**Generated**: ${formatDate(summary.generatedAt)}`);
  lines.push("");

  if (summary.objectives.length > 0) {
    lines.push("## Objectives");
    for (const obj of summary.objectives) {
      lines.push(`- ${obj}`);
    }
    lines.push("");
  }

  if (summary.accomplishments.length > 0) {
    lines.push("## Accomplishments");
    for (const acc of summary.accomplishments) {
      lines.push(`- ${acc}`);
    }
    lines.push("");
  }

  if (summary.decisions.length > 0) {
    lines.push("## Decisions");
    for (const dec of summary.decisions) {
      lines.push(`- ${dec}`);
    }
    lines.push("");
  }

  if (summary.filesChanged.length > 0) {
    lines.push("## Files Changed");
    for (const f of summary.filesChanged) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }

  if (summary.blockers.length > 0) {
    lines.push("## Blockers");
    for (const b of summary.blockers) {
      lines.push(`- ⚠️ ${b}`);
    }
    lines.push("");
  }

  if (summary.nextSteps.length > 0) {
    lines.push("## Next Steps");
    for (const ns of summary.nextSteps) {
      lines.push(`- [ ] ${ns}`);
    }
    lines.push("");
  }

  if (includeMetrics && summary.metrics) {
    lines.push("## Metrics");
    lines.push(metricsToMarkdown(summary.metrics));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export a standup report to markdown format
 */
export function standupToMarkdown(standup: StandupReport): string {
  const lines: string[] = [];

  lines.push(`# Daily Standup — ${standup.date}`);
  lines.push("");

  if (standup.projects.length > 0) {
    lines.push(`**Projects**: ${standup.projects.join(", ")}`);
    lines.push("");
  }

  lines.push("## Yesterday");
  for (const item of standup.yesterday) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Today");
  for (const item of standup.today) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  if (standup.blockers.length > 0) {
    lines.push("## Blockers");
    for (const b of standup.blockers) {
      lines.push(`- ⚠️ ${b}`);
    }
    lines.push("");
  } else {
    lines.push("## Blockers");
    lines.push("- None");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Helpers ──

function metricsToMarkdown(metrics: SessionMetrics): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Events | ${metrics.totalEvents} |`);
  lines.push(`| Files Changed | ${metrics.filesChanged} |`);
  lines.push(`| Git Commits | ${metrics.gitCommits} |`);
  lines.push(`| Errors Encountered | ${metrics.errorsEncountered} |`);
  lines.push(`| Errors Resolved | ${metrics.errorsResolved} |`);
  lines.push(`| Duration | ${metrics.durationMinutes} min |`);
  return lines.join("\n");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
