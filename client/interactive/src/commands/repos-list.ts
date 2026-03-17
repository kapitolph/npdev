import { fetchRepos, fetchSessions, sessionsForRepo } from "../lib/sessions";
import type { Machine } from "../types";

export async function cmdReposList(machine: Machine, opts: { json?: boolean } = {}): Promise<void> {
  const [repos, sessions] = await Promise.all([fetchRepos(machine), fetchSessions(machine)]);

  if (opts.json) {
    const enriched = repos.map((r) => {
      const repoSessions = sessionsForRepo(sessions, repos, r.path);
      const activeUsers = [
        ...new Set(
          repoSessions
            .filter((s) => parseInt(s.client_count || "0", 10) > 0)
            .flatMap((s) => (s.attached_users || s.owner || "").split(",").filter(Boolean)),
        ),
      ];
      return {
        ...r,
        sessions: repoSessions.length,
        active_users: activeUsers,
      };
    });
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }

  if (repos.length === 0) {
    console.log("No git repos found.");
    return;
  }

  const maxName = Math.max(...repos.map((r) => r.name.length), 4);
  const maxBranch = Math.max(...repos.map((r) => r.branch.length), 6);

  console.log(
    `${"NAME".padEnd(maxName)}  ${"BRANCH".padEnd(maxBranch)}  ${"SESSIONS".padEnd(8)}  ${"ACTIVE USERS".padEnd(16)}  PATH`,
  );

  for (const r of repos) {
    const repoSessions = sessions.filter((s) => s.pane_cwd && s.pane_cwd.startsWith(r.path));
    const activeUsers = [
      ...new Set(
        repoSessions
          .filter((s) => parseInt(s.client_count || "0", 10) > 0)
          .flatMap((s) => (s.attached_users || s.owner || "").split(",").filter(Boolean)),
      ),
    ];

    console.log(
      `${r.name.padEnd(maxName)}  ${r.branch.padEnd(maxBranch)}  ${String(repoSessions.length).padEnd(8)}  ${(activeUsers.join(",") || "-").padEnd(16)}  ${r.path}`,
    );
  }
}
