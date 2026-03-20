import { execSync } from "node:child_process";
import type { GitCommit, SessionEvent } from "../types.js";

/**
 * Collect git commits within a time range from a repository
 */
export function collectGitCommits(
  repoPath: string,
  since?: string,
  until?: string,
): GitCommit[] {
  const args = ["git", "log", "--format=%H|%s|%an|%aI", "--shortstat"];

  if (since) args.push(`--since="${since}"`);
  if (until) args.push(`--until="${until}"`);

  try {
    const output = execSync(args.join(" "), {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 10000,
    });
    return parseGitLog(output);
  } catch {
    return [];
  }
}

/**
 * Convert git commits to session events
 */
export function commitsToEvents(
  sessionId: string,
  commits: GitCommit[],
): SessionEvent[] {
  return commits.map((commit) => ({
    sessionId,
    category: "git_commit" as const,
    title: commit.message,
    detail: `${commit.hash.slice(0, 8)} by ${commit.author} (+${commit.insertions}/-${commit.deletions}, ${commit.filesChanged} files)`,
    timestamp: commit.timestamp,
    metadata: {
      hash: commit.hash,
      author: commit.author,
      filesChanged: commit.filesChanged,
      insertions: commit.insertions,
      deletions: commit.deletions,
    },
  }));
}

/**
 * Get the current git diff stats (staged + unstaged)
 */
export function getGitDiffStats(repoPath: string): string[] {
  try {
    const output = execSync("git diff --stat HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 5000,
    });
    return output
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => l.trim().split("|")[0].trim());
  } catch {
    return [];
  }
}

// ── Parser ──

function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = output.split("\n").filter((l) => l.trim());

  let current: Partial<GitCommit> | null = null;

  for (const line of lines) {
    // Format: hash|subject|author|date
    if (line.includes("|") && !line.includes("file")) {
      const parts = line.split("|");
      if (parts.length >= 4) {
        if (current?.hash) {
          commits.push(fillDefaults(current));
        }
        current = {
          hash: parts[0],
          message: parts[1],
          author: parts[2],
          timestamp: parts[3],
        };
      }
    }
    // Shortstat line: " 3 files changed, 10 insertions(+), 2 deletions(-)"
    else if (line.includes("file") && line.includes("changed") && current) {
      const filesMatch = line.match(/(\d+)\s+file/);
      const insMatch = line.match(/(\d+)\s+insertion/);
      const delMatch = line.match(/(\d+)\s+deletion/);
      current.filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
      current.insertions = insMatch ? parseInt(insMatch[1]) : 0;
      current.deletions = delMatch ? parseInt(delMatch[1]) : 0;
    }
  }

  if (current?.hash) {
    commits.push(fillDefaults(current));
  }

  return commits;
}

function fillDefaults(partial: Partial<GitCommit>): GitCommit {
  return {
    hash: partial.hash ?? "",
    message: partial.message ?? "",
    author: partial.author ?? "",
    timestamp: partial.timestamp ?? new Date().toISOString(),
    filesChanged: partial.filesChanged ?? 0,
    insertions: partial.insertions ?? 0,
    deletions: partial.deletions ?? 0,
  };
}
