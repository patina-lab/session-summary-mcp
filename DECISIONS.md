# Architecture Decision Records

## ADR-001: MCP Server (not CLI)
- **Date**: 2026-03-19
- **Decision**: Implement as an MCP server, not a CLI tool
- **Rationale**:
  - Core value is real-time in-session tracking — must be callable as MCP tools
  - MCP servers work across multiple clients (Claude Code, Gemini CLI, Cursor, etc.)
  - CLI tools are better suited for post-hoc analysis, not live tracking
- **Alternatives**: CLI tool — less natural for real-time event tracking during sessions

## ADR-002: SQLite + FTS5 Storage
- **Date**: 2026-03-19
- **Decision**: Use better-sqlite3 with FTS5 full-text search
- **Rationale**:
  - Fully local, zero external dependencies
  - FTS5 provides sufficient search performance for event queries
  - Proven pattern in similar MCP servers (e.g., context-mode)
- **Alternatives**: JSON files (poor search), vector DB (excessive complexity for MVP)

## ADR-003: Template-based Summarization (no LLM for MVP)
- **Date**: 2026-03-19
- **Decision**: MVP uses rule-based templates for summary generation; LLM integration planned for v0.3
- **Rationale**:
  - Works immediately without API key setup
  - Events are structured data — pattern matching yields sufficient quality
  - LLM dependency should be optional, not required
- **Alternatives**: Claude Haiku from day one — setup barrier too high for MVP

## ADR-004: MCP SDK v1
- **Date**: 2026-03-19
- **Decision**: Use @modelcontextprotocol/sdk v1 (^1.27.1)
- **Rationale**:
  - v2 monorepo split is still in transition
  - v1 is the most widely adopted and stable
- **Future**: Migrate to v2 once stabilized

## ADR-005: Market Differentiation
- **Date**: 2026-03-19
- **Decision**: Focus on "real-time in-session tracking → auto standup generation"
- **Rationale**:
  - JSONL-to-markdown conversion is a red ocean (5+ existing tools: ccexport, claude-code-log, etc.)
  - Token cost analysis is already well-served by ccusage
  - GitHub Issue anthropics/claude-code#29585 (120+ thumbs up) confirms demand for daily reports
  - Real-time event tracking + cross-session standup generation is genuinely unoccupied
