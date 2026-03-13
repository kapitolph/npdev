import chalk from "chalk";
import type { Machine, SessionData } from "../types";
import { sshExec } from "../lib/ssh";

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

export async function cmdList(machine: Machine): Promise<void> {
  const sessions = await fetchSessions(machine);

  if (sessions.length === 0) {
    console.log(chalk.dim("  No active sessions."));
    return;
  }

  // Header
  console.log(
    chalk.bold(
      `  ${"Name".padEnd(20)} ${"Owner".padEnd(12)} ${"Type".padEnd(8)} ${"Last Active".padEnd(14)} Created`
    )
  );
  console.log(chalk.dim("  " + "─".repeat(76)));

  for (const s of sessions) {
    console.log(
      `  ${chalk.cyan(s.name.padEnd(20))} ${s.owner.padEnd(12)} ${s.type.padEnd(8)} ${relativeTime(s.last_activity).padEnd(14)} ${s.created_at}`
    );
  }
}
