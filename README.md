# session-summary-mcp

MCP server that tracks AI coding session activities and generates human-readable summaries, standups, and reports.

**The problem**: After a long coding session with Claude Code (or any AI assistant), answering "what did I do today?" requires manually reviewing each session. There's no automated way to generate daily standups or progress reports from your AI-assisted work.

**The solution**: An MCP server that runs alongside your AI coding sessions, tracking events in real-time and generating summaries on demand — from a single session recap to a full daily standup report.

## Features

- **Session Tracking** — Start/end sessions with goals, track events (decisions, milestones, errors, blockers)
- **Claude Code Import** — Parse Claude Code's JSONL session logs to retroactively capture file changes, tool calls, and git commits
- **Git Integration** — Import git commits as session events
- **Smart Summarization** — Generate structured summaries with objectives, accomplishments, decisions, files changed, and next steps
- **Standup Generation** — Auto-generate daily standup reports (yesterday/today/blockers)
- **Full-Text Search** — Search across all session events using SQLite FTS5
- **Export** — Output as Markdown or JSON, optionally write to file

## Quick Start

### Install

```bash
npm install -g session-summary-mcp
```

Or run directly:

```bash
npx session-summary-mcp
```

### Configure with Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "session-summary": {
      "command": "npx",
      "args": ["-y", "session-summary-mcp"]
    }
  }
}
```

### Optional: Auto-track with Hooks

Add hooks to automatically start/end sessions:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "echo 'Session started'"
      }
    ]
  }
}
```

## MCP Tools

### Session Lifecycle

| Tool | Description |
|------|-------------|
| `start_session` | Begin tracking a new session with optional project name and goal |
| `end_session` | End a session and auto-generate a summary |
| `track_event` | Record an event (decision, milestone, error, blocker, note, etc.) |

### Data Import

| Tool | Description |
|------|-------------|
| `import_claude_sessions` | Import session data from Claude Code's JSONL files (`~/.claude/projects/`) |
| `import_git_commits` | Import git commits as events for a session |

### Reporting

| Tool | Description |
|------|-------------|
| `summarize` | Generate a summary for a session or date range |
| `generate_standup` | Create a daily standup report (yesterday/today/blockers) |
| `export` | Export summary or standup as Markdown/JSON file |

### Query

| Tool | Description |
|------|-------------|
| `list_sessions` | List tracked sessions with filters (project, date range) |
| `search_sessions` | Full-text search across all session events |

## Usage Examples

### Track a session manually

```
> Start a session for my project
# Claude calls start_session(projectName: "my-app", goal: "Add user authentication")

> I decided to use JWT instead of session cookies
# Claude calls track_event(category: "decision", title: "Use JWT for auth")

> Authentication is working, let's wrap up
# Claude calls end_session(sessionId: "...")
# Returns: summary with accomplishments, decisions, files changed
```

### Import and analyze past sessions

```
> Import my Claude Code sessions from the last week
# Claude calls import_claude_sessions(since: "2026-03-12T00:00:00Z")
# Returns: "15 sessions imported, 3 skipped"

> Generate today's standup
# Claude calls generate_standup()
# Returns formatted yesterday/today/blockers report
```

### Export a report

```
> Export today's summary as markdown to ~/reports/
# Claude calls export(type: "summary", format: "markdown", outputPath: "~/reports/daily")
# Writes ~/reports/daily.md
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SUMMARY_DB_PATH` | `~/.session-summary-mcp/sessions.db` | SQLite database location |
| `SESSION_SUMMARY_CLAUDE_DIR` | `~/.claude` | Claude Code data directory |

## Data Storage

All data is stored locally in a SQLite database with:
- **Sessions** — project, goal, start/end times
- **Events** — categorized activities with timestamps
- **Summaries** — generated reports
- **FTS5 index** — full-text search across events

No data is sent to external services. The optional LLM summarization (future feature) will use your own API key.

## Architecture

```
┌──────────────────────────────────────┐
│       MCP Client (Claude Code)       │
│                                      │
│  start_session → track_event → ...   │
│  summarize / generate_standup        │
└──────────────┬───────────────────────┘
               │ stdio
┌──────────────▼───────────────────────┐
│      session-summary-mcp server      │
│                                      │
│  ┌───────────┐ ┌───────────┐         │
│  │ Collector │ │ Summarizer│         │
│  │ • JSONL   │ │ • Template│         │
│  │ • Git log │ │ • Rollup  │         │
│  └─────┬─────┘ └──────┬────┘         │
│        │              │              │
│  ┌─────▼──────────────▼─────┐        │
│  │     SQLite (FTS5)        │        │
│  └──────────────────────────┘        │
└──────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Roadmap

- [ ] **v0.2**: Slack / Notion / Linear export targets
- [ ] **v0.2**: Multi-agent session support (Gemini CLI, Cursor)
- [ ] **v0.3**: LLM-powered summarization (Claude Haiku)
- [ ] **v0.3**: Weekly rollup reports
- [ ] **v0.4**: Web dashboard
- [ ] **v0.4**: Non-developer mode (file-change tracking without git)

## License

MIT
