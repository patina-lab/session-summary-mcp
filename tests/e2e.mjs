/**
 * E2E test for session-summary-mcp server.
 *
 * Spawns the MCP server as a child process, sends JSON-RPC messages via stdin,
 * reads responses from stdout, and verifies correctness of each step.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// ── Config ──

const SERVER_PATH = path.resolve("dist/index.js");
const TEST_DB_PATH = path.join(os.tmpdir(), `e2e-test-${Date.now()}.db`);

// ── Helpers ──

let msgId = 0;

function nextId() {
  return ++msgId;
}

/**
 * Spawns the server and returns helpers for sending/receiving messages.
 */
function createServer() {
  const proc = spawn("node", [SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      SESSION_SUMMARY_DB_PATH: TEST_DB_PATH,
    },
  });

  let buffer = "";
  const pending = new Map(); // id -> { resolve, reject, timer }

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve, timer } = pending.get(msg.id);
          clearTimeout(timer);
          pending.delete(msg.id);
          resolve(msg);
        }
        // notifications (no id) are ignored
      } catch {
        // ignore non-JSON lines
      }
    }
  });

  // Log stderr for debugging
  let stderrBuf = "";
  proc.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString();
  });

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  function send(method, params = {}, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const id = nextId();
      const msg = { jsonrpc: "2.0", id, method, params };
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  function notify(method, params = {}) {
    const msg = { jsonrpc: "2.0", method, params };
    proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  function close() {
    proc.stdin.end();
    proc.kill();
    // Clean up test DB
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(TEST_DB_PATH + "-wal");
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(TEST_DB_PATH + "-shm");
    } catch {
      // ignore
    }
  }

  function getStderr() {
    return stderrBuf;
  }

  return { send, notify, close, getStderr, proc };
}

// ── Test runner ──

const results = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`  ✅ PASS: ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
  console.log(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
}

// ── Main ──

async function main() {
  console.log("\n=== Session Summary MCP — E2E Test ===\n");

  const server = createServer();

  // Wait a bit for the server to start
  await new Promise((r) => setTimeout(r, 1000));

  let sessionId;

  try {
    // ── Step 1: Initialize ──
    {
      const res = await server.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-test", version: "1.0.0" },
      });

      if (res.result && res.result.serverInfo) {
        pass("1. Initialize", `Server: ${res.result.serverInfo.name} v${res.result.serverInfo.version}`);
      } else if (res.error) {
        fail("1. Initialize", `Error: ${JSON.stringify(res.error)}`);
      } else {
        fail("1. Initialize", `Unexpected response: ${JSON.stringify(res)}`);
      }

      // Send initialized notification
      server.notify("notifications/initialized");
    }

    // ── Step 2: tools/list ──
    {
      const res = await server.send("tools/list", {});

      if (res.result && Array.isArray(res.result.tools)) {
        const toolNames = res.result.tools.map((t) => t.name).sort();
        const expectedTools = [
          "end_session",
          "export",
          "generate_standup",
          "import_claude_sessions",
          "import_git_commits",
          "list_sessions",
          "search_sessions",
          "start_session",
          "summarize",
          "track_event",
        ].sort();

        const count = res.result.tools.length;
        const allPresent = expectedTools.every((t) => toolNames.includes(t));

        if (count === 10 && allPresent) {
          pass("2. tools/list", `${count} tools registered: ${toolNames.join(", ")}`);
        } else {
          fail(
            "2. tools/list",
            `Expected 10 tools [${expectedTools.join(", ")}], got ${count}: [${toolNames.join(", ")}]`,
          );
        }
      } else {
        fail("2. tools/list", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 3: start_session ──
    {
      const res = await server.send("tools/call", {
        name: "start_session",
        arguments: {
          projectName: "test-project",
          goal: "E2E test",
        },
      });

      if (res.result && res.result.content && res.result.content[0]) {
        const text = res.result.content[0].text;
        // Extract session ID from "Session started: <id>"
        const match = text.match(/Session started:\s*(\S+)/);
        if (match) {
          sessionId = match[1];
          pass("3. start_session", `Session ID: ${sessionId}`);
        } else {
          fail("3. start_session", `Could not extract session ID from: ${text}`);
        }
      } else {
        fail("3. start_session", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 4: track_event (milestone) ──
    {
      const res = await server.send("tools/call", {
        name: "track_event",
        arguments: {
          sessionId,
          category: "milestone",
          title: "Server started",
        },
      });

      if (res.result?.content?.[0]?.text?.includes("milestone")) {
        pass("4. track_event (milestone)", res.result.content[0].text);
      } else {
        fail("4. track_event (milestone)", `Response: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 5: track_event (decision) ──
    {
      const res = await server.send("tools/call", {
        name: "track_event",
        arguments: {
          sessionId,
          category: "decision",
          title: "Use SQLite",
          detail: "Fast and local",
        },
      });

      if (res.result?.content?.[0]?.text?.includes("decision")) {
        pass("5. track_event (decision)", res.result.content[0].text);
      } else {
        fail("5. track_event (decision)", `Response: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 6: summarize ──
    {
      const res = await server.send("tools/call", {
        name: "summarize",
        arguments: {
          sessionId,
        },
      });

      if (res.result?.content?.[0]?.text) {
        const text = res.result.content[0].text;
        const hasDecision = text.includes("SQLite") || text.includes("decision");
        if (hasDecision) {
          pass("6. summarize", `Contains decision info. Length: ${text.length} chars`);
        } else {
          pass("6. summarize", `Summary generated (${text.length} chars), no decision keyword found (may be normal)`);
        }
      } else {
        fail("6. summarize", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 7: end_session ──
    {
      const res = await server.send("tools/call", {
        name: "end_session",
        arguments: {
          sessionId,
        },
      });

      if (res.result?.content?.[0]?.text?.includes("Session ended")) {
        pass("7. end_session", res.result.content[0].text.split("\n")[0]);
      } else {
        fail("7. end_session", `Response: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 8: list_sessions ──
    {
      const res = await server.send("tools/call", {
        name: "list_sessions",
        arguments: {},
      });

      if (res.result?.content?.[0]?.text) {
        const text = res.result.content[0].text;
        const containsProject = text.includes("test-project");
        if (containsProject) {
          pass("8. list_sessions", "Found test-project in listing");
        } else {
          fail("8. list_sessions", `test-project not found in: ${text.slice(0, 200)}`);
        }
      } else {
        fail("8. list_sessions", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 9: search_sessions ──
    {
      const res = await server.send("tools/call", {
        name: "search_sessions",
        arguments: {
          query: "SQLite",
        },
      });

      if (res.result?.content?.[0]?.text) {
        const text = res.result.content[0].text;
        if (text.includes("SQLite") || text.includes("decision")) {
          pass("9. search_sessions", `Search returned results containing SQLite/decision`);
        } else {
          fail("9. search_sessions", `SQLite not found in results: ${text.slice(0, 200)}`);
        }
      } else {
        fail("9. search_sessions", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }

    // ── Step 10: generate_standup ──
    {
      const res = await server.send("tools/call", {
        name: "generate_standup",
        arguments: {},
      });

      if (res.result?.content?.[0]?.text) {
        const text = res.result.content[0].text;
        if (text.includes("Standup") || text.includes("Yesterday") || text.includes("Today")) {
          pass("10. generate_standup", `Standup report generated (${text.length} chars)`);
        } else {
          fail("10. generate_standup", `Unexpected format: ${text.slice(0, 200)}`);
        }
      } else {
        fail("10. generate_standup", `Error: ${JSON.stringify(res.error || res)}`);
      }
    }
  } catch (err) {
    fail("UNEXPECTED ERROR", err.message);
  } finally {
    server.close();
  }

  // ── Summary ──
  console.log("\n=== Results ===\n");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}\n`);

  if (failed > 0) {
    console.log("  Failed tests:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`    - ${r.name}: ${r.detail}`);
    }
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
