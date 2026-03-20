import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseClaudeSession,
  extractEvents,
  buildSessionFromMessages,
  calculateTokenUsage,
} from "../src/collector/claude-parser.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeMessage } from "../src/types.js";

describe("Claude Parser", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claude-parser-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleMessages: ClaudeMessage[] = [
    {
      type: "user",
      message: {
        role: "user",
        content: "Implement a login feature",
      },
      timestamp: "2026-03-18T10:00:00.000Z",
      sessionId: "test-session",
      cwd: "/Users/test/project",
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I'll implement the login feature.",
          },
          {
            type: "tool_use",
            name: "Write",
            input: { file_path: "/Users/test/project/src/login.ts" },
          },
        ],
        model: "claude-opus-4-6",
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 800,
        },
      },
      timestamp: "2026-03-18T10:01:00.000Z",
      sessionId: "test-session",
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: {
              command: 'git commit -m "feat: add login feature"',
            },
          },
        ],
        model: "claude-opus-4-6",
        usage: {
          input_tokens: 500,
          output_tokens: 100,
        },
      },
      timestamp: "2026-03-18T10:05:00.000Z",
      sessionId: "test-session",
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "/Users/test/project/src/auth.ts" },
          },
        ],
        model: "claude-opus-4-6",
        usage: { input_tokens: 200, output_tokens: 50 },
      },
      timestamp: "2026-03-18T10:02:00.000Z",
      sessionId: "test-session",
    },
  ];

  describe("parseClaudeSession", () => {
    it("should parse JSONL file into messages", () => {
      const filePath = join(tmpDir, "session.jsonl");
      const content = sampleMessages.map((m) => JSON.stringify(m)).join("\n");
      writeFileSync(filePath, content);

      const result = parseClaudeSession(filePath);
      expect(result).toHaveLength(4);
      expect(result[0].type).toBe("user");
      expect(result[1].type).toBe("assistant");
    });

    it("should skip malformed lines", () => {
      const filePath = join(tmpDir, "bad.jsonl");
      writeFileSync(
        filePath,
        '{"type":"user","timestamp":"2026-01-01T00:00:00Z"}\n{bad json}\n{"type":"assistant","timestamp":"2026-01-01T00:01:00Z"}',
      );

      const result = parseClaudeSession(filePath);
      expect(result).toHaveLength(2);
    });
  });

  describe("extractEvents", () => {
    it("should extract file change events from Write tool calls", () => {
      const events = extractEvents("test-session", sampleMessages);
      const fileChanges = events.filter((e) => e.category === "file_change");
      expect(fileChanges).toHaveLength(1);
      expect(fileChanges[0].title).toBe("login.ts");
    });

    it("should extract git commit events", () => {
      const events = extractEvents("test-session", sampleMessages);
      const commits = events.filter((e) => e.category === "git_commit");
      expect(commits).toHaveLength(1);
      expect(commits[0].title).toBe("feat: add login feature");
    });

    it("should skip Read/Glob/Grep tool calls (noisy)", () => {
      const events = extractEvents("test-session", sampleMessages);
      const readEvents = events.filter(
        (e) => e.metadata?.tool === "Read",
      );
      expect(readEvents).toHaveLength(0);
    });
  });

  describe("buildSessionFromMessages", () => {
    it("should build a session object", () => {
      const session = buildSessionFromMessages(
        "test-session",
        sampleMessages,
        "/Users/test/project",
      );

      expect(session.id).toBe("test-session");
      expect(session.projectName).toBe("project");
      expect(session.goal).toBe("Implement a login feature");
      expect(session.startedAt).toBe("2026-03-18T10:00:00.000Z");
      expect(session.endedAt).toBe("2026-03-18T10:02:00.000Z");
    });
  });

  describe("calculateTokenUsage", () => {
    it("should sum up token usage across messages", () => {
      const usage = calculateTokenUsage(sampleMessages);
      expect(usage.inputTokens).toBe(1700); // 1000 + 500 + 200
      expect(usage.outputTokens).toBe(650); // 500 + 100 + 50
      expect(usage.cacheCreation).toBe(200);
      expect(usage.cacheRead).toBe(800);
    });
  });
});
