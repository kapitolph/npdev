import type { Machine } from "../types";

const SSH_OPTS = ["-o", "StrictHostKeyChecking=accept-new"];

function sshTarget(machine: Machine): string {
  return `${machine.user}@${machine.host}`;
}

/** Run an SSH command and capture stdout */
export async function sshExec(machine: Machine, command: string): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["ssh", ...SSH_OPTS, sshTarget(machine), command], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

/** Run an interactive SSH command with TTY passthrough */
export async function sshInteractive(machine: Machine, command: string): Promise<number> {
  const proc = Bun.spawn(["ssh", "-t", ...SSH_OPTS, sshTarget(machine), command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}
