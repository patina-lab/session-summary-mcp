# session-summary-mcp

[![npm version](https://img.shields.io/npm/v/session-summary-mcp.svg)](https://www.npmjs.com/package/session-summary-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The only MCP server that auto-generates daily standups from your AI coding sessions.**

After a long session with Claude Code (or any AI assistant), answering "what did I do today?" means manually reviewing each conversation. This MCP server tracks your work in real-time and generates standup reports on demand.

## What it does

1. **Track** — Record decisions, milestones, errors, and blockers during your session
2. **Import** — Pull in Claude Code session logs and git commits retroactively
3. **Summarize** — Generate structured summaries (objectives, accomplishments, files changed, next steps)
4. **Standup** — Auto-generate daily standup reports (yesterday / today / blockers)
5. **Export** — Output as Markdown or JSON
6. **Search** — Full-text search across all your past sessions

All data stays local in a SQLite database. No external services, no API keys needed.

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3** and a C++ compiler for `better-sqlite3` native module:
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt install build-essential python3`
  - Windows: `npm install --global windows-build-tools`

### Configure with Claude Code

Add to `~/.claude/settings.json`:

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

That's it. Restart Claude Code and the tools are available.

> **Other MCP clients** (Cursor, Windsurf, Zed, etc.): Connect via stdio transport — run `npx session-summary-mcp` as the server command.

## MCP Tools

### Session Lifecycle

| Tool | Description |
|------|-------------|
| `start_session` | Begin tracking a new session with optional project name and goal |
| `end_session` | End a session (or the most recent active one) and auto-generate a summary |
| `track_event` | Record an event — decision, milestone, error, blocker, note, etc. |
| `get_active_session` | Get the currently active (not ended) session |

### Data Import

| Tool | Description |
|------|-------------|
| `import_claude_sessions` | Import session data from Claude Code's JSONL files (`~/.claude/projects/`). Extracts file changes, tool calls, and git commits. |
| `import_git_commits` | Import git commits from a repo as session events |

### Reporting

| Tool | Description |
|------|-------------|
| `summarize` | Generate a summary for a session or date range |
| `generate_standup` | Create a daily standup report (yesterday/today/blockers) |
| `export_report` | Export summary or standup as Markdown/JSON, optionally write to file |

### Query

| Tool | Description |
|------|-------------|
| `list_sessions` | List tracked sessions with filters (project, date range) |
| `search_sessions` | Full-text search across all session events (plain keywords work) |
| `delete_session` | Delete a session and all its events |

## Usage Examples

### Track a session

```
You: "Start tracking this session — I'm working on the auth module"
  → start_session(projectName: "my-app", goal: "Implement auth module")

You: "I decided to use JWT instead of session cookies"
  → track_event(category: "decision", title: "Use JWT for auth", detail: "Stateless, scales better")

You: "Let's wrap up"
  → end_session()
  → Returns: summary with accomplishments, decisions, files changed
```

### Import past sessions and generate standup

```
You: "Import my recent Claude Code sessions"
  → import_claude_sessions(since: "2025-01-06T00:00:00Z")
  → "15 sessions imported, 3 skipped"

You: "Generate today's standup"
  → generate_standup()
  → Formatted yesterday/today/blockers report
```

### Export a report

```
You: "Export today's summary to ~/reports/"
  → export_report(type: "summary", format: "markdown", outputPath: "~/reports/daily")
  → Writes ~/reports/daily.md
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SESSION_SUMMARY_DB_PATH` | `~/.session-summary-mcp/sessions.db` | SQLite database path |
| `SESSION_SUMMARY_CLAUDE_DIR` | `~/.claude` | Claude Code data directory |

### Data Management

Data is stored at `~/.session-summary-mcp/sessions.db`. To reset all data:

```bash
rm ~/.session-summary-mcp/sessions.db
```

The database is auto-created on next server start.

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
│  │ Collector  │ │ Summarizer│         │
│  │ • JSONL    │ │ • Template│         │
│  │ • Git log  │ │ • Rollup  │         │
│  └─────┬─────┘ └─────┬─────┘         │
│        │              │               │
│  ┌─────▼──────────────▼─────┐         │
│  │     SQLite (FTS5)        │         │
│  └──────────────────────────┘         │
└──────────────────────────────────────┘
```

## Development

```bash
npm install
npm run build
npm test        # 27 tests
npm run dev     # watch mode
```

## Roadmap

- [ ] **v0.2**: Slack / Notion / Linear export
- [ ] **v0.2**: Multi-agent support (Gemini CLI, Cursor)
- [ ] **v0.3**: LLM-powered summarization (Claude Haiku)
- [ ] **v0.3**: Weekly rollup reports
- [ ] **v0.4**: Web dashboard

## License

[MIT](LICENSE)
