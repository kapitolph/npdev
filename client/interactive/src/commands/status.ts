import { activityAge, fetchRepos, fetchSessions, relativeTime } from "../lib/sessions";
import type { Machine } from "../types";

export async function cmdStatus(machine: Machine, opts: { json?: boolean } = {}): Promise<void> {
  const [sessions, repos] = await Promise.all([
    fetchSessions(machine),
    fetchRepos(machine),
  ]);

  const activeSessions = sessions.filter(s => parseInt(s.client_count || "0", 10) > 0);
  const idleSessions = sessions.filter(s => {
    const count = parseInt(s.client_count || "0", 10);
    const age = activityAge(s.last_activity);
    return count === 0 && age < 3 * 86400;
  });
  const staleSessions = sessions.filter(s => {
    const count = parseInt(s.client_count || "0", 10);
    return count === 0 && activityAge(s.last_activity) >= 3 * 86400;
  });

  const activeUsers = [...new Set(
    activeSessions.flatMap(s => (s.attached_users || "").split(",").filter(Boolean)),
  )];

  if (opts.json) {
    console.log(JSON.stringify({
      sessions: {
        total: sessions.length,
        active: activeSessions.length,
        idle: idleSessions.length,
        stale: staleSessions.length,
        list: sessions,
      },
      repos: repos.map(r => {
        const repoSessions = sessions.filter(s => s.pane_cwd && s.pane_cwd.startsWith(r.path));
        return { ...r, session_count: repoSessions.length };
      }),
      active_users: activeUsers,
    }, null, 2));
    return;
  }

  console.log(`VPS Status: ${machine.name}`);
  console.log();

  // Active users
  if (activeUsers.length > 0) {
    console.log(`Online now: ${activeUsers.join(", ")}`);
  } else {
    console.log("Online now: nobody");
  }
  console.log();

  // Sessions summary
  console.log(`Sessions: ${sessions.length} total (${activeSessions.length} active, ${idleSessions.length} idle, ${staleSessions.length} stale)`);
  if (activeSessions.length > 0) {
    for (const s of activeSessions) {
      const users = (s.attached_users || "").split(",").filter(Boolean).join(",");
      console.log(`  ${s.name.padEnd(20)}  ${s.owner.padEnd(10)}  ${relativeTime(s.last_activity)}  [${users}]`);
    }
  }
  console.log();

  // Repos summary
  console.log(`Repos: ${repos.length}`);
  for (const r of repos) {
    const count = sessions.filter(s => s.pane_cwd && s.pane_cwd.startsWith(r.path)).length;
    console.log(`  ${r.name.padEnd(24)}  ${r.branch.padEnd(12)}  ${count > 0 ? `${count} session(s)` : "-"}`);
  }
}
