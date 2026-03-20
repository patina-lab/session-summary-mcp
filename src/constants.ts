import { homedir } from "node:os";
import { join } from "node:path";

export const BRAND = {
  name: "session-summary-mcp",
  displayName: "Session Summary",
  version: "0.1.1",
} as const;

export const DEFAULTS = {
  claudeDataDir: join(homedir(), ".claude"),
  dbPath: join(homedir(), ".session-summary-mcp", "sessions.db"),
} as const;
