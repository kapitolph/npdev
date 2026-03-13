import * as p from "@clack/prompts";
import chalk from "chalk";
import type { Machine, SessionData } from "../types";
import { sshExec } from "../lib/ssh";
import { sshInteractive } from "../lib/ssh";

export async function fetchSessions(machine: Machine): Promise<SessionData[]> {
  const { stdout, exitCode } = await sshExec(machine, "bash ~/.vps/session.sh session-data");
  if (exitCode !== 0 || !stdout) return [];
  try {
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

function relativeTime(epoch: string): string {
  if (!epoch) return "unknown";
  const seconds = Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function activityAge(epoch: string): number {
  if (!epoch) return Infinity;
  return Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
}

function printTable(sessions: SessionData[]): void {
  if (sessions.length === 0) {
    console.log(chalk.dim("\n  No active sessions.\n"));
    return;
  }

  console.log();
  console.log(
    chalk.bold(
      `  ${"Name".padEnd(20)} ${"Owner".padEnd(12)} ${"Type".padEnd(8)} ${"Last Active".padEnd(14)} Created`
    )
  );
  console.log(chalk.dim("  " + "─".repeat(76)));

  for (const s of sessions) {
    const age = activityAge(s.last_activity);
    const stale = age > 3 * 86400;
    const nameStr = stale ? chalk.yellow(s.name.padEnd(20)) : chalk.cyan(s.name.padEnd(20));
    const activeStr = stale
      ? chalk.yellow(relativeTime(s.last_activity).padEnd(14))
      : relativeTime(s.last_activity).padEnd(14);

    console.log(
      `  ${nameStr} ${s.owner.padEnd(12)} ${s.type.padEnd(8)} ${activeStr} ${s.created_at}`
    );
  }
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
      const stale = sessions.filter((s) => activityAge(s.last_activity) > 3 * 86400);
      const owners = uniqueOwners(sessions);

      const filterOptions: { value: string; label: string; hint?: string }[] = [];
      if (mine.length > 0) {
        filterOptions.push({ value: "mine", label: "My sessions", hint: `${mine.length}` });
      }
      if (stale.length > 0) {
        filterOptions.push({ value: "stale", label: "Inactive 3+ days", hint: `${stale.length}` });
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
          filtered = stale;
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
        (a, b) => (parseInt(a.last_activity, 10) || 0) - (parseInt(b.last_activity, 10) || 0)
      );

      const selected = await p.multiselect({
        message: "Select sessions to end (space to toggle)",
        options: sorted.map((s) => {
          const age = activityAge(s.last_activity);
          const stale = age > 3 * 86400;
          const timeStr = relativeTime(s.last_activity);
          const activeLabel = stale ? chalk.yellow(timeStr) : chalk.dim(timeStr);
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
