import * as p from "@clack/prompts";
import chalk from "chalk";
import type { Machine } from "../types";
import { fetchSessions } from "./list";
import { sshExec } from "../lib/ssh";

function relativeTime(epoch: string): string {
  if (!epoch) return "unknown";
  const seconds = Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function cmdCleanup(machine: Machine, npdevUser: string): Promise<void> {
  const sessions = await fetchSessions(machine);

  if (sessions.length === 0) {
    p.log.info("No active sessions to clean up.");
    return;
  }

  const mine = sessions.filter((s) => s.owner === npdevUser);
  const filterOptions: { value: string; label: string }[] = [
    { value: "all", label: `All sessions (${sessions.length})` },
  ];
  if (mine.length > 0 && mine.length < sessions.length) {
    filterOptions.unshift({ value: "mine", label: `My sessions (${mine.length})` });
  }

  let filtered = sessions;
  if (filterOptions.length > 1) {
    const filter = await p.select({
      message: "Which sessions?",
      options: filterOptions,
    });
    if (p.isCancel(filter)) return;
    if (filter === "mine") filtered = mine;
  }

  // Sort by oldest activity first
  const sorted = [...filtered].sort((a, b) => {
    const aTime = parseInt(a.last_activity, 10) || 0;
    const bTime = parseInt(b.last_activity, 10) || 0;
    return aTime - bTime;
  });

  const selected = await p.multiselect({
    message: "Select sessions to end (space to toggle, enter to confirm)",
    options: sorted.map((s) => ({
      value: s.name,
      label: `${s.name} (${s.owner}, last active: ${relativeTime(s.last_activity)})`,
    })),
    required: false,
  });

  if (p.isCancel(selected)) return;
  if (selected.length === 0) {
    p.log.info("No sessions selected.");
    return;
  }

  console.log("\n  Sessions to end:");
  for (const name of selected) {
    console.log(chalk.red(`    • ${name}`));
  }

  const confirmed = await p.confirm({
    message: `End ${selected.length} session(s)?`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.log.info("Cancelled.");
    return;
  }

  for (const name of selected) {
    const { exitCode } = await sshExec(machine, `bash ~/.vps/session.sh end '${name}'`);
    if (exitCode === 0) {
      p.log.success(`Ended: ${name}`);
    } else {
      p.log.error(`Failed to end: ${name}`);
    }
  }
}
