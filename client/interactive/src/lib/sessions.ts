import type { Machine, SessionData } from "../types";
import { sshExec } from "./ssh";

export async function fetchSessions(machine: Machine): Promise<SessionData[]> {
  const { stdout, exitCode } = await sshExec(machine, "bash ~/.vps/session.sh session-data");
  if (exitCode !== 0 || !stdout) return [];
  try {
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

export function relativeTime(epoch: string): string {
  if (!epoch) return "unknown";
  const seconds = Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function activityAge(epoch: string): number {
  if (!epoch) return Infinity;
  return Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
}
