import type { Summary, StandupReport } from "../types.js";

/**
 * Export a summary to JSON format
 */
export function summaryToJson(summary: Summary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Export a standup report to JSON format
 */
export function standupToJson(standup: StandupReport): string {
  return JSON.stringify(standup, null, 2);
}
