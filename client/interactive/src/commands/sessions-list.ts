import { activityAge, fetchSessions, relativeTime } from "../lib/sessions";
import type { Machine, SessionData } from "../types";

export async function cmdSessionsList(machine: Machine, opts: { json?: boolean } = {}): Promise<void> {
  const sessions = await fetchSessions(machine);

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log("No active sessions.");
    return;
  }

  const sorted = [...sessions].sort(
    (a, b) => (parseInt(b.last_activity, 10) || 0) - (parseInt(a.last_activity, 10) || 0),
  );

  const maxName = Math.max(...sorted.map(s => s.name.length), 4);
  const maxOwner = Math.max(...sorted.map(s => s.owner.length), 5);

  console.log(
    `${"NAME".padEnd(maxName)}  ${"OWNER".padEnd(maxOwner)}  ${"STATUS".padEnd(8)}  ${"ACTIVITY".padEnd(12)}  ${"ATTACHED".padEnd(8)}  CWD`,
  );

  for (const s of sorted) {
    const count = parseInt(s.client_count || "0", 10);
    const age = activityAge(s.last_activity);
    const status = count > 0 ? "active" : age >= 3 * 86400 ? "stale" : "idle";
    const users = (s.attached_users || "").split(",").filter(Boolean).join(",") || "-";

    console.log(
      `${s.name.padEnd(maxName)}  ${s.owner.padEnd(maxOwner)}  ${status.padEnd(8)}  ${relativeTime(s.last_activity).padEnd(12)}  ${users.padEnd(8)}  ${s.pane_cwd || "-"}`,
    );
  }
}
