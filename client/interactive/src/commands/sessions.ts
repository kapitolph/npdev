import * as p from "@clack/prompts";
import chalk from "chalk";
import { activityAge, fetchSessions, relativeTime } from "../lib/sessions";
import { sshExec, sshInteractive } from "../lib/ssh";
import type { Machine, SessionData } from "../types";

export { fetchSessions };

function printTable(sessions: SessionData[]): void {
  if (sessions.length === 0) {
    console.log(chalk.dim("\n  No active sessions.\n"));
    return;
  }

  const sorted = [...sessions].sort(
    (a, b) => (parseInt(b.last_activity, 10) || 0) - (parseInt(a.last_activity, 10) || 0),
  );

  // Group into active, idle, stale
  const active: SessionData[] = [];
  const idle: SessionData[] = [];
  const stale: SessionData[] = [];

  for (const s of sorted) {
    const count = parseInt(s.client_count || "0", 10);
    const age = activityAge(s.last_activity);
    if (count > 0) {
      active.push(s);
    } else if (age >= 3 * 86400) {
      stale.push(s);
    } else {
      idle.push(s);
    }
  }

  const printGroup = (label: string, items: SessionData[], color: (s: string) => string) => {
    if (items.length === 0) return;
    console.log();
    console.log(`  ${color(label)}`);
    console.log(chalk.dim(`  ${"─".repeat(76)}`));
    for (const s of items) {
      const count = parseInt(s.client_count || "0", 10);
      const nameStr = color(s.name.padEnd(20));
      const activeStr = color(relativeTime(s.last_activity).padEnd(14));
      const countStr = count > 0 ? chalk.green(` ${count} attached`) : "";
      console.log(`  ${nameStr} ${s.owner.padEnd(12)} ${s.type.padEnd(8)} ${activeStr}${countStr}`);
    }
  };

  printGroup("Active", active, chalk.green);
  printGroup("Idle", idle, (s) => s);
  printGroup("Stale (3+ days)", stale, chalk.yellow);

  console.log();
}

function uniqueOwners(sessions: SessionData[]): string[] {
  return [...new Set(sessions.map((s) => s.owner))].sort();
}

async function fetchWithSpinner(machine: Machine): Promise<SessionData[]> {
  const s = p.spinner();
  s.start("Fetching sessions");
  const sessions = await fetchSessions(machine);
  s.stop(`${sessions.length} active session(s)`);
  return sessions;
}

export async function cmdSessions(machine: Machine, npdevUser: string): Promise<void> {
  let sessions = await fetchWithSpinner(machine);
  printTable(sessions);

  if (sessions.length === 0) return;

  while (true) {
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "join", label: "Join a session", hint: "attach to an existing tmux session" },
        { value: "end", label: "End sessions", hint: "select one or more sessions to terminate" },
        { value: "back", label: "Back" },
      ],
    });

    if (p.isCancel(action) || action === "back") return;

    if (action === "join") {
      const choice = await p.select({
        message: "Which session?",
        options: sessions.map((s) => ({
          value: s.name,
          label: `${s.name} ${chalk.dim("·")} ${s.owner} ${chalk.dim("·")} ${relativeTime(s.last_activity)}`,
        })),
      });
      if (p.isCancel(choice)) continue;

      const cmd = `bash ~/.vps/session.sh start '${choice}' 'shell' '' '${npdevUser}'`;
      const exitCode = await sshInteractive(machine, cmd);
      process.exit(exitCode);
    }

    if (action === "end") {
      // Build filter options dynamically
      const mine = sessions.filter((s) => s.owner === npdevUser);
      const staleSessions = sessions.filter((s) => activityAge(s.last_activity) > 3 * 86400);
      const owners = uniqueOwners(sessions);

      const filterOptions: { value: string; label: string; hint?: string }[] = [];
      if (mine.length > 0) {
        filterOptions.push({ value: "mine", label: "My sessions", hint: `${mine.length}` });
      }
      if (staleSessions.length > 0) {
        filterOptions.push({
          value: "stale",
          label: "Inactive 3+ days",
          hint: `${staleSessions.length}`,
        });
      }
      if (owners.length > 1) {
        filterOptions.push({ value: "by-owner", label: "By owner..." });
      }
      filterOptions.push({ value: "all", label: "All sessions", hint: `${sessions.length}` });

      let filtered = sessions;

      // Skip filter prompt if there's only "all"
      if (filterOptions.length > 1) {
        const filter = await p.select({
          message: "Filter sessions",
          options: filterOptions,
        });
        if (p.isCancel(filter)) continue;

        if (filter === "mine") {
          filtered = mine;
        } else if (filter === "stale") {
          filtered = staleSessions;
        } else if (filter === "by-owner") {
          const owner = await p.select({
            message: "Select owner",
            options: owners.map((o) => ({
              value: o,
              label: o,
              hint: `${sessions.filter((s) => s.owner === o).length} session(s)`,
            })),
          });
          if (p.isCancel(owner)) continue;
          filtered = sessions.filter((s) => s.owner === owner);
        }
      }

      // Sort oldest activity first
      const sorted = [...filtered].sort(
        (a, b) => (parseInt(a.last_activity, 10) || 0) - (parseInt(b.last_activity, 10) || 0),
      );

      const selected = await p.multiselect({
        message: "Select sessions to end (space to toggle)",
        options: sorted.map((s) => {
          const age = activityAge(s.last_activity);
          const isStale = age > 3 * 86400;
          const timeStr = relativeTime(s.last_activity);
          const activeLabel = isStale ? chalk.yellow(timeStr) : chalk.dim(timeStr);
          return {
            value: s.name,
            label: `${s.name} ${chalk.dim("·")} ${s.owner} ${chalk.dim("·")} ${activeLabel}`,
          };
        }),
        required: false,
      });

      if (p.isCancel(selected) || selected.length === 0) {
        if (!p.isCancel(selected) && selected.length === 0) {
          p.log.info("No sessions selected.");
        }
        continue;
      }

      // Confirmation
      console.log();
      for (const name of selected) {
        console.log(chalk.red(`    ✕ ${name}`));
      }
      console.log();

      const confirmed = await p.confirm({
        message: `End ${selected.length} session(s)?`,
      });

      if (p.isCancel(confirmed) || !confirmed) {
        p.log.info("Cancelled.");
        continue;
      }

      for (const name of selected) {
        const { exitCode } = await sshExec(machine, `bash ~/.vps/session.sh end '${name}'`);
        if (exitCode === 0) {
          p.log.success(`Ended: ${name}`);
        } else {
          p.log.error(`Failed to end: ${name}`);
        }
      }

      // Refresh and re-display
      sessions = await fetchWithSpinner(machine);
      printTable(sessions);
      if (sessions.length === 0) return;
    }
  }
}
