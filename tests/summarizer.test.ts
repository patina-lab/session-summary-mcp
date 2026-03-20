import { describe, it, expect } from "vitest";
import {
  generateSummary,
  generateStandupFromEvents,
} from "../src/summarizer/templates.js";
import type { SessionEvent } from "../src/types.js";

describe("Summarizer", () => {
  const sampleEvents: SessionEvent[] = [
    {
      sessionId: "s1",
      category: "milestone",
      title: "Project initialized",
      timestamp: "2026-03-18T10:00:00.000Z",
    },
    {
      sessionId: "s1",
      category: "file_change",
      title: "index.ts",
      detail: "Write: /project/src/index.ts",
      timestamp: "2026-03-18T10:30:00.000Z",
    },
    {
      sessionId: "s1",
      category: "file_change",
      title: "types.ts",
      detail: "Write: /project/src/types.ts",
      timestamp: "2026-03-18T10:45:00.000Z",
    },
    {
      sessionId: "s1",
      category: "git_commit",
      title: "feat: initial implementation",
      timestamp: "2026-03-18T11:00:00.000Z",
    },
    {
      sessionId: "s1",
      category: "decision",
      title: "Use SQLite",
      detail: "Lightweight and supports FTS5",
      timestamp: "2026-03-18T10:15:00.000Z",
    },
    {
      sessionId: "s1",
      category: "error",
      title: "Build failed",
      timestamp: "2026-03-18T11:15:00.000Z",
    },
    {
      sessionId: "s1",
      category: "error_resolved",
      title: "Build failed",
      timestamp: "2026-03-18T11:20:00.000Z",
    },
    {
      sessionId: "s1",
      category: "blocker",
      title: "Waiting for API key",
      timestamp: "2026-03-18T11:30:00.000Z",
    },
    {
      sessionId: "s1",
      category: "note",
      title: "Next: add tests for parser",
      timestamp: "2026-03-18T12:00:00.000Z",
    },
  ];

  describe("generateSummary", () => {
    it("should generate a complete summary from events", () => {
      const summary = generateSummary(
        "s1",
        sampleEvents,
        "2026-03-18T10:00:00.000Z",
        "2026-03-18T12:00:00.000Z",
      );

      expect(summary.sessionId).toBe("s1");
      expect(summary.objectives).toContain("Project initialized");
      expect(summary.accomplishments).toContain(
        "feat: initial implementation",
      );
      expect(summary.accomplishments).toContain("Fixed: Build failed");
      expect(summary.decisions).toContain(
        "Use SQLite: Lightweight and supports FTS5",
      );
      expect(summary.filesChanged).toContain("index.ts");
      expect(summary.filesChanged).toContain("types.ts");
      expect(summary.blockers).toContain("Waiting for API key");
      expect(summary.nextSteps).toContain("Next: add tests for parser");
    });

    it("should handle empty events", () => {
      const summary = generateSummary(
        "s1",
        [],
        "2026-03-18T10:00:00.000Z",
        "2026-03-18T12:00:00.000Z",
      );

      expect(summary.objectives).toHaveLength(1);
      expect(summary.accomplishments).toHaveLength(1);
      expect(summary.filesChanged).toHaveLength(0);
    });
  });

  describe("generateStandupFromEvents", () => {
    it("should generate a standup report", () => {
      const standup = generateStandupFromEvents(
        sampleEvents, // yesterday
        [], // today
        [{ sessionId: "s1", category: "blocker", title: "Waiting for API key", timestamp: "" }],
        ["test-project"],
        "2026-03-19",
      );

      expect(standup.date).toBe("2026-03-19");
      expect(standup.yesterday.length).toBeGreaterThan(0);
      expect(standup.today).toContain(
        "Continue from yesterday's progress",
      );
      expect(standup.blockers).toContain("Waiting for API key");
      expect(standup.projects).toContain("test-project");
    });

    it("should deduplicate items in yesterday summary", () => {
      const duplicateEvents: SessionEvent[] = [
        {
          sessionId: "s1",
          category: "git_commit",
          title: "feat: add X",
          timestamp: "2026-03-18T10:00:00.000Z",
        },
        {
          sessionId: "s1",
          category: "git_commit",
          title: "feat: add X", // exact duplicate
          timestamp: "2026-03-18T11:00:00.000Z",
        },
      ];

      const standup = generateStandupFromEvents(
        duplicateEvents,
        [],
        [],
        [],
        "2026-03-19",
      );

      // "feat: add X" should appear only once, plus file change summary shouldn't appear
      const commitItems = standup.yesterday.filter((y) =>
        y.includes("feat: add X"),
      );
      expect(commitItems).toHaveLength(1);
    });
  });
});
