import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionRepository } from "../src/db/repository.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Session, SessionEvent } from "../src/types.js";

describe("SessionRepository", () => {
  let repo: SessionRepository;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-summary-test-"));
    repo = new SessionRepository(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    repo.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Sessions ──

  describe("sessions", () => {
    const mockSession: Session = {
      id: "test-session-1",
      projectPath: "/Users/test/project",
      projectName: "test-project",
      goal: "Implement feature X",
      startedAt: "2026-03-18T10:00:00.000Z",
    };

    it("should create and retrieve a session", () => {
      repo.createSession(mockSession);
      const result = repo.getSession("test-session-1");

      expect(result).toBeDefined();
      expect(result!.id).toBe("test-session-1");
      expect(result!.projectName).toBe("test-project");
      expect(result!.goal).toBe("Implement feature X");
    });

    it("should end a session", () => {
      repo.createSession(mockSession);
      repo.endSession("test-session-1", "2026-03-18T12:00:00.000Z");

      const result = repo.getSession("test-session-1");
      expect(result!.endedAt).toBe("2026-03-18T12:00:00.000Z");
    });

    it("should list sessions with filters", () => {
      repo.createSession(mockSession);
      repo.createSession({
        ...mockSession,
        id: "test-session-2",
        projectName: "other-project",
        startedAt: "2026-03-17T10:00:00.000Z",
      });

      const all = repo.listSessions();
      expect(all).toHaveLength(2);

      const filtered = repo.listSessions({ projectName: "test-project" });
      expect(filtered).toHaveLength(1);

      const since = repo.listSessions({ since: "2026-03-18T00:00:00.000Z" });
      expect(since).toHaveLength(1);
    });

    it("should return undefined for non-existent session", () => {
      const result = repo.getSession("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  // ── Events ──

  describe("events", () => {
    const sessionId = "test-session-1";

    beforeEach(() => {
      repo.createSession({
        id: sessionId,
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T10:00:00.000Z",
      });
    });

    it("should add and retrieve events", () => {
      const event: SessionEvent = {
        sessionId,
        category: "milestone",
        title: "Feature X implemented",
        detail: "All tests passing",
        timestamp: "2026-03-18T11:00:00.000Z",
      };

      const created = repo.addEvent(event);
      expect(created.id).toBeDefined();

      const events = repo.getEvents(sessionId);
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Feature X implemented");
    });

    it("should add multiple events in a transaction", () => {
      const events: SessionEvent[] = [
        {
          sessionId,
          category: "file_change",
          title: "index.ts",
          timestamp: "2026-03-18T10:30:00.000Z",
        },
        {
          sessionId,
          category: "git_commit",
          title: "feat: add feature X",
          timestamp: "2026-03-18T11:00:00.000Z",
        },
        {
          sessionId,
          category: "decision",
          title: "Use SQLite for storage",
          detail: "Lightweight, embedded, FTS5 support",
          timestamp: "2026-03-18T10:15:00.000Z",
        },
      ];

      repo.addEvents(events);
      const result = repo.getEvents(sessionId);
      expect(result).toHaveLength(3);
      // Should be ordered by timestamp
      expect(result[0].category).toBe("decision");
      expect(result[1].category).toBe("file_change");
      expect(result[2].category).toBe("git_commit");
    });

    it("should get events by date range", () => {
      repo.addEvents([
        {
          sessionId,
          category: "note",
          title: "Morning work",
          timestamp: "2026-03-18T09:00:00.000Z",
        },
        {
          sessionId,
          category: "note",
          title: "Afternoon work",
          timestamp: "2026-03-18T14:00:00.000Z",
        },
      ]);

      const result = repo.getEventsByRange(
        "2026-03-18T12:00:00.000Z",
        "2026-03-18T23:59:59.000Z",
      );
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Afternoon work");
    });

    it("should search events with FTS5", () => {
      repo.addEvents([
        {
          sessionId,
          category: "milestone",
          title: "Database migration completed",
          detail: "All tables created successfully",
          timestamp: "2026-03-18T10:00:00.000Z",
        },
        {
          sessionId,
          category: "error",
          title: "Build failed",
          detail: "TypeScript compilation error",
          timestamp: "2026-03-18T11:00:00.000Z",
        },
      ]);

      const results = repo.searchEvents("database");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Database migration completed");

      const errorResults = repo.searchEvents("TypeScript");
      expect(errorResults).toHaveLength(1);
      expect(errorResults[0].category).toBe("error");
    });
  });

  // ── Metrics ──

  describe("metrics", () => {
    it("should calculate session metrics", () => {
      const sessionId = "metrics-session";
      repo.createSession({
        id: sessionId,
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T10:00:00.000Z",
        endedAt: "2026-03-18T12:00:00.000Z",
      });

      repo.addEvents([
        {
          sessionId,
          category: "file_change",
          title: "index.ts",
          timestamp: "2026-03-18T10:30:00.000Z",
        },
        {
          sessionId,
          category: "file_change",
          title: "types.ts",
          timestamp: "2026-03-18T10:45:00.000Z",
        },
        {
          sessionId,
          category: "file_change",
          title: "index.ts", // duplicate file
          timestamp: "2026-03-18T11:00:00.000Z",
        },
        {
          sessionId,
          category: "git_commit",
          title: "feat: add stuff",
          timestamp: "2026-03-18T11:30:00.000Z",
        },
        {
          sessionId,
          category: "error",
          title: "Build failed",
          timestamp: "2026-03-18T11:15:00.000Z",
        },
        {
          sessionId,
          category: "error_resolved",
          title: "Build fixed",
          timestamp: "2026-03-18T11:20:00.000Z",
        },
      ]);

      const metrics = repo.getSessionMetrics(sessionId);
      expect(metrics.totalEvents).toBe(6);
      expect(metrics.filesChanged).toBe(2); // unique files
      expect(metrics.gitCommits).toBe(1);
      expect(metrics.errorsEncountered).toBe(1);
      expect(metrics.errorsResolved).toBe(1);
      expect(metrics.durationMinutes).toBe(120);
    });
  });

  // ── Active Session ──

  describe("active session", () => {
    it("should return the most recent active session", () => {
      repo.createSession({
        id: "ended-session",
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T08:00:00.000Z",
        endedAt: "2026-03-18T09:00:00.000Z",
      });
      repo.createSession({
        id: "active-session",
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T10:00:00.000Z",
      });

      const active = repo.getActiveSession();
      expect(active).toBeDefined();
      expect(active!.id).toBe("active-session");
    });

    it("should return undefined when no active sessions", () => {
      repo.createSession({
        id: "ended",
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T08:00:00.000Z",
        endedAt: "2026-03-18T09:00:00.000Z",
      });

      expect(repo.getActiveSession()).toBeUndefined();
    });
  });

  // ── Delete Session ──

  describe("delete session", () => {
    it("should delete session and all related data", () => {
      repo.createSession({
        id: "del-session",
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T10:00:00.000Z",
      });
      repo.addEvent({
        sessionId: "del-session",
        category: "note",
        title: "test event",
        timestamp: "2026-03-18T10:30:00.000Z",
      });

      const deleted = repo.deleteSession("del-session");
      expect(deleted).toBe(true);
      expect(repo.getSession("del-session")).toBeUndefined();
      expect(repo.getEvents("del-session")).toHaveLength(0);
    });

    it("should return false for non-existent session", () => {
      expect(repo.deleteSession("nonexistent")).toBe(false);
    });
  });

  // ── Summaries ──

  describe("summaries", () => {
    it("should save and retrieve a summary", () => {
      repo.createSession({
        id: "sum-session",
        projectPath: "/test",
        projectName: "test",
        startedAt: "2026-03-18T10:00:00.000Z",
      });

      const summary = repo.saveSummary({
        sessionId: "sum-session",
        rangeStart: "2026-03-18T10:00:00.000Z",
        rangeEnd: "2026-03-18T12:00:00.000Z",
        objectives: ["Build feature X"],
        accomplishments: ["Implemented feature X", "Added tests"],
        decisions: ["Use SQLite"],
        filesChanged: ["index.ts", "types.ts"],
        nextSteps: ["Deploy to staging"],
        blockers: [],
        generatedAt: "2026-03-18T12:00:00.000Z",
      });

      expect(summary.id).toBeDefined();

      const retrieved = repo.getSummary("sum-session");
      expect(retrieved).toBeDefined();
      expect(retrieved!.accomplishments).toHaveLength(2);
      expect(retrieved!.decisions).toEqual(["Use SQLite"]);
    });
  });
});
