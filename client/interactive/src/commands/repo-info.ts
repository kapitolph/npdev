import { fetchRepoCommits, fetchRepos, fetchSessions, relativeTime } from "../lib/sessions";
import { notFoundError } from "../lib/errors";
import type { Machine } from "../types";

export async function cmdRepoInfo(
  machine: Machine,
  nameOrPath: string,
  opts: { json?: boolean; commits?: number } = {},
): Promise<void> {
  const repos = await fetchRepos(machine);

  // Match by name or path
  const repo = repos.find(r => r.name === nameOrPath || r.path === nameOrPath);
  if (!repo) {
    throw notFoundError(`Repo not found: ${nameOrPath}`, {
      requested: nameOrPath,
      available: repos.map(r => r.name),
    });
  }

  const [sessions, commits] = await Promise.all([
    fetchSessions(machine),
    fetchRepoCommits(machine, repo.path),
  ]);

  const repoSessions = sessions.filter(s => s.pane_cwd && s.pane_cwd.startsWith(repo.path));

  if (opts.json) {
    console.log(JSON.stringify({
      ...repo,
      sessions: repoSessions,
      commits: commits.slice(0, opts.commits || 10),
    }, null, 2));
    return;
  }

  console.log(`Repo:    ${repo.name}`);
  console.log(`Path:    ${repo.path}`);
  console.log(`Branch:  ${repo.branch}`);
  console.log();

  if (repoSessions.length > 0) {
    console.log(`Sessions (${repoSessions.length}):`);
    for (const s of repoSessions) {
      const count = parseInt(s.client_count || "0", 10);
      const status = count > 0 ? "active" : "idle";
      const users = count > 0 ? (s.attached_users || "").split(",").filter(Boolean).join(",") : "";
      console.log(`  ${s.name.padEnd(20)}  ${s.owner.padEnd(10)}  ${status.padEnd(6)}  ${relativeTime(s.last_activity)}${users ? `  [${users}]` : ""}`);
    }
  } else {
    console.log("Sessions: none");
  }

  if (commits.length > 0) {
    console.log();
    console.log(`Recent Commits:`);
    for (const c of commits.slice(0, opts.commits || 10)) {
      console.log(`  ${c.hash}  ${c.author.padEnd(12)}  ${c.date.padEnd(14)}  ${c.subject}`);
    }
  }
}
