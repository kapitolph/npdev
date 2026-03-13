import type { Machine } from "../types";
import { isOnVPS } from "./config";

const SSH_OPTS = ["-o", "StrictHostKeyChecking=accept-new"];

function sshTarget(machine: Machine): string {
  return `${machine.user}@${machine.host}`;
}

/** Run a command (locally on VPS, or via SSH) and capture stdout */
export async function sshExec(
  machine: Machine,
  command: string,
): Promise<{ stdout: string; exitCode: number }> {
  const args = isOnVPS()
    ? ["bash", "-c", command]
    : ["ssh", ...SSH_OPTS, sshTarget(machine), command];
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

/** Run an interactive command with TTY passthrough (locally on VPS, or via SSH) */
export async function sshInteractive(machine: Machine, command: string): Promise<number> {
  const args = isOnVPS()
    ? ["bash", "-c", command]
    : ["ssh", "-t", ...SSH_OPTS, sshTarget(machine), command];
  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}
