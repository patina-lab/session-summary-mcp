import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SessionRepository } from "./db/repository.js";
import { BRAND, DEFAULTS } from "./constants.js";
import {
  startSession,
  endSession,
  trackEvent,
  importClaudeSessions,
  importGitCommits,
} from "./tools/track.js";
import { summarize, generateStandup } from "./tools/summarize.js";
import { exportReport, listSessions, searchSessions } from "./tools/export.js";

// ── Initialize ──

const dbPath = process.env.SESSION_SUMMARY_DB_PATH ?? DEFAULTS.dbPath;
const claudeDataDir =
  process.env.SESSION_SUMMARY_CLAUDE_DIR ?? DEFAULTS.claudeDataDir;

const repo = new SessionRepository(dbPath);

const server = new McpServer({
  name: BRAND.name,
  version: BRAND.version,
});

// ── Tool: start_session ──

server.tool(
  "start_session",
  "Start tracking a new coding session. Call this at the beginning of a work session to begin collecting events.",
  {
    projectPath: z
      .string()
      .optional()
      .describe("Absolute path to the project directory"),
    projectName: z.string().optional().describe("Human-readable project name"),
    goal: z.string().optional().describe("What you plan to accomplish"),
  },
  async (params) => {
    const session = startSession(repo, params);
    return {
      content: [
        {
          type: "text",
          text: `Session started: ${session.id}\nProject: ${session.projectName}\nGoal: ${session.goal ?? "not set"}`,
        },
      ],
    };
  },
);

// ── Tool: end_session ──

server.tool(
  "end_session",
  "End the current tracking session. Automatically generates a summary of what was accomplished.",
  {
    sessionId: z.string().describe("Session ID to end"),
  },
  async ({ sessionId }) => {
    endSession(repo, sessionId);
    const summary = summarize(repo, { sessionId });
    repo.saveSummary(summary);

    const accomplishments = summary.accomplishments.join("\n- ");
    return {
      content: [
        {
          type: "text",
          text: `Session ended: ${sessionId}\n\nAccomplishments:\n- ${accomplishments}\n\nFiles changed: ${summary.filesChanged.length}\nDecisions: ${summary.decisions.length}`,
        },
      ],
    };
  },
);

// ── Tool: track_event ──

server.tool(
  "track_event",
  "Record a notable event in the current session (decision, milestone, error, blocker, note, etc.)",
  {
    sessionId: z.string().describe("Session ID"),
    category: z
      .enum([
        "file_change",
        "git_commit",
        "error",
        "error_resolved",
        "decision",
        "milestone",
        "note",
        "blocker",
        "blocker_resolved",
      ])
      .describe("Event category"),
    title: z.string().describe("Short description of the event"),
    detail: z
      .string()
      .optional()
      .describe("Additional details or context"),
  },
  async (params) => {
    const event = trackEvent(repo, params);
    return {
      content: [
        {
          type: "text",
          text: `Event tracked: [${event.category}] ${event.title}`,
        },
      ],
    };
  },
);

// ── Tool: summarize ──

server.tool(
  "summarize",
  "Generate a summary of a session or date range. Returns objectives, accomplishments, decisions, files changed, and next steps.",
  {
    sessionId: z
      .string()
      .optional()
      .describe("Specific session ID to summarize"),
    since: z
      .string()
      .optional()
      .describe("Start date (ISO 8601). Defaults to today"),
    until: z.string().optional().describe("End date (ISO 8601). Defaults to now"),
    projectName: z.string().optional().describe("Filter by project name"),
  },
  async (params) => {
    const summary = summarize(repo, params);
    repo.saveSummary(summary);

    const sections = [
      `## Objectives\n${summary.objectives.map((o) => `- ${o}`).join("\n")}`,
      `## Accomplishments\n${summary.accomplishments.map((a) => `- ${a}`).join("\n")}`,
      summary.decisions.length > 0
        ? `## Decisions\n${summary.decisions.map((d) => `- ${d}`).join("\n")}`
        : null,
      summary.filesChanged.length > 0
        ? `## Files Changed\n${summary.filesChanged.map((f) => `- \`${f}\``).join("\n")}`
        : null,
      summary.blockers.length > 0
        ? `## Blockers\n${summary.blockers.map((b) => `- ${b}`).join("\n")}`
        : null,
      summary.nextSteps.length > 0
        ? `## Next Steps\n${summary.nextSteps.map((n) => `- ${n}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      content: [{ type: "text", text: `# Session Summary\n\n${sections}` }],
    };
  },
);

// ── Tool: generate_standup ──

server.tool(
  "generate_standup",
  "Generate a daily standup report (yesterday/today/blockers format). Aggregates across all sessions for the given date.",
  {
    date: z
      .string()
      .optional()
      .describe("Date for standup (YYYY-MM-DD). Defaults to today"),
    projectName: z.string().optional().describe("Filter by project name"),
  },
  async (params) => {
    const standup = generateStandup(repo, params);

    const report = [
      `# Daily Standup — ${standup.date}`,
      standup.projects.length > 0
        ? `**Projects**: ${standup.projects.join(", ")}`
        : "",
      `## Yesterday\n${standup.yesterday.map((y) => `- ${y}`).join("\n")}`,
      `## Today\n${standup.today.map((t) => `- ${t}`).join("\n")}`,
      `## Blockers\n${standup.blockers.length > 0 ? standup.blockers.map((b) => `- ${b}`).join("\n") : "- None"}`,
    ].join("\n\n");

    return { content: [{ type: "text", text: report }] };
  },
);

// ── Tool: export ──

server.tool(
  "export",
  "Export a summary or standup report to markdown or JSON. Optionally writes to a file.",
  {
    type: z
      .enum(["summary", "standup"])
      .describe("Report type to export"),
    format: z
      .enum(["markdown", "json"])
      .optional()
      .describe("Output format. Default: markdown"),
    outputPath: z
      .string()
      .optional()
      .describe("File path to write. If omitted, returns content only"),
    sessionId: z
      .string()
      .optional()
      .describe("Session ID (for summary type)"),
    date: z
      .string()
      .optional()
      .describe("Date (for standup type, YYYY-MM-DD)"),
    projectName: z.string().optional().describe("Filter by project name"),
    includeMetrics: z
      .boolean()
      .optional()
      .describe("Include session metrics in output"),
  },
  async (params) => {
    const result = exportReport(repo, params);
    const msg = result.filePath
      ? `Exported to: ${result.filePath}\n\n${result.content}`
      : result.content;
    return { content: [{ type: "text", text: msg }] };
  },
);

// ── Tool: import_claude_sessions ──

server.tool(
  "import_claude_sessions",
  "Import session data from Claude Code's local JSONL files (~/.claude/projects/). Parses conversation logs to extract events, tool calls, and file changes.",
  {
    since: z
      .string()
      .optional()
      .describe("Only import sessions modified after this date (ISO 8601)"),
    projectFilter: z
      .string()
      .optional()
      .describe("Only import sessions matching this project path substring"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of sessions to import"),
  },
  async (params) => {
    const result = importClaudeSessions(repo, claudeDataDir, params);
    return {
      content: [
        {
          type: "text",
          text: `Import complete: ${result.imported} sessions imported, ${result.skipped} skipped (already imported or empty)`,
        },
      ],
    };
  },
);

// ── Tool: import_git_commits ──

server.tool(
  "import_git_commits",
  "Import git commits from a repository as events for a session.",
  {
    sessionId: z.string().describe("Session ID to attach commits to"),
    repoPath: z.string().describe("Path to the git repository"),
    since: z.string().optional().describe("Start date (ISO 8601)"),
    until: z.string().optional().describe("End date (ISO 8601)"),
  },
  async (params) => {
    const count = importGitCommits(
      repo,
      params.sessionId,
      params.repoPath,
      params.since,
      params.until,
    );
    return {
      content: [
        {
          type: "text",
          text: `Imported ${count} git commit(s) for session ${params.sessionId}`,
        },
      ],
    };
  },
);

// ── Tool: list_sessions ──

server.tool(
  "list_sessions",
  "List tracked sessions with optional filters. Shows project name, goal, duration, and event count.",
  {
    projectName: z.string().optional().describe("Filter by project name"),
    since: z.string().optional().describe("Sessions started after (ISO 8601)"),
    until: z.string().optional().describe("Sessions started before (ISO 8601)"),
    limit: z.number().optional().describe("Max results. Default: 20"),
  },
  async (params) => {
    const sessions = listSessions(repo, params);
    if (sessions.length === 0) {
      return {
        content: [{ type: "text", text: "No sessions found." }],
      };
    }

    const lines = sessions.map((s) => {
      const duration = s.endedAt
        ? `${Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)} min`
        : "ongoing";
      return `- **${s.projectName}** (${duration}, ${s.eventCount} events)\n  ID: \`${s.id}\`\n  Goal: ${s.goal ?? "—"}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `# Sessions (${sessions.length})\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  },
);

// ── Tool: search_sessions ──

server.tool(
  "search_sessions",
  "Full-text search across all session events. Finds events by keyword.",
  {
    query: z.string().describe("Search query (supports FTS5 syntax)"),
    limit: z.number().optional().describe("Max results. Default: 20"),
  },
  async (params) => {
    const results = searchSessions(repo, params.query, params.limit);
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results for "${params.query}"`,
          },
        ],
      };
    }

    const lines = results.map(
      (r) =>
        `- [${r.category}] **${r.title}**\n  ${r.detail ?? ""}\n  Session: \`${r.sessionId}\` | ${r.timestamp}`,
    );

    return {
      content: [
        {
          type: "text",
          text: `# Search: "${params.query}" (${results.length} results)\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  },
);

// ── Start server ──

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${BRAND.displayName} MCP server running on stdio`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
