import { describe, it, expect } from "vitest";
import {
  summaryToMarkdown,
  standupToMarkdown,
} from "../src/exporter/markdown.js";
import { summaryToJson, standupToJson } from "../src/exporter/json.js";
import type { Summary, StandupReport } from "../src/types.js";

describe("Exporter", () => {
  const sampleSummary: Summary = {
    sessionId: "test-session",
    rangeStart: "2026-03-18T10:00:00.000Z",
    rangeEnd: "2026-03-18T12:00:00.000Z",
    objectives: ["Implement login feature"],
    accomplishments: ["Added login endpoint", "Wrote unit tests"],
    decisions: ["Use JWT for auth"],
    filesChanged: ["src/login.ts", "src/auth.ts"],
    nextSteps: ["Add integration tests"],
    blockers: [],
    metrics: {
      totalEvents: 15,
      filesChanged: 2,
      gitCommits: 3,
      errorsEncountered: 1,
      errorsResolved: 1,
      durationMinutes: 120,
    },
    generatedAt: "2026-03-18T12:00:00.000Z",
  };

  const sampleStandup: StandupReport = {
    date: "2026-03-19",
    yesterday: ["Implemented login feature", "Fixed auth bug"],
    today: ["Add integration tests", "Deploy to staging"],
    blockers: ["Waiting for DB credentials"],
    projects: ["my-project"],
  };

  describe("summaryToMarkdown", () => {
    it("should generate valid markdown", () => {
      const md = summaryToMarkdown(sampleSummary);

      expect(md).toContain("# Session Summary");
      expect(md).toContain("## Objectives");
      expect(md).toContain("- Implement login feature");
      expect(md).toContain("## Accomplishments");
      expect(md).toContain("- Added login endpoint");
      expect(md).toContain("## Decisions");
      expect(md).toContain("- Use JWT for auth");
      expect(md).toContain("## Files Changed");
      expect(md).toContain("`src/login.ts`");
      expect(md).toContain("## Next Steps");
      expect(md).toContain("- [ ] Add integration tests");
      expect(md).toContain("## Metrics");
      expect(md).toContain("| Duration | 120 min |");
    });

    it("should skip metrics when includeMetrics is false", () => {
      const md = summaryToMarkdown(sampleSummary, false);
      expect(md).not.toContain("## Metrics");
    });

    it("should skip empty sections", () => {
      const md = summaryToMarkdown(sampleSummary);
      expect(md).not.toContain("## Blockers"); // empty blockers
    });
  });

  describe("standupToMarkdown", () => {
    it("should generate standup format", () => {
      const md = standupToMarkdown(sampleStandup);

      expect(md).toContain("# Daily Standup — 2026-03-19");
      expect(md).toContain("**Projects**: my-project");
      expect(md).toContain("## Yesterday");
      expect(md).toContain("- Implemented login feature");
      expect(md).toContain("## Today");
      expect(md).toContain("- Deploy to staging");
      expect(md).toContain("## Blockers");
      expect(md).toContain("Waiting for DB credentials");
    });
  });

  describe("JSON export", () => {
    it("should produce valid JSON for summary", () => {
      const json = summaryToJson(sampleSummary);
      const parsed = JSON.parse(json);
      expect(parsed.sessionId).toBe("test-session");
      expect(parsed.accomplishments).toHaveLength(2);
    });

    it("should produce valid JSON for standup", () => {
      const json = standupToJson(sampleStandup);
      const parsed = JSON.parse(json);
      expect(parsed.date).toBe("2026-03-19");
      expect(parsed.blockers).toHaveLength(1);
    });
  });
});
