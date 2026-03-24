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

/** Run a command with stdin piped from a string (locally on VPS, or via SSH) */
export async function sshExecWithInput(
  machine: Machine,
  command: string,
  input: string,
): Promise<{ stdout: string; exitCode: number }> {
  const args = isOnVPS()
    ? ["bash", "-c", command]
    : ["ssh", ...SSH_OPTS, sshTarget(machine), command];
  const proc = Bun.spawn(args, {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

/** Run an interactive command with TTY passthrough (locally on VPS, or via SSH/mosh) */
export async function sshInteractive(
  machine: Machine,
  command: string,
  opts?: { mosh?: boolean },
): Promise<number> {
  let shellCmd: string;
  if (isOnVPS()) {
    shellCmd = command;
  } else if (opts?.mosh) {
    const target = sshTarget(machine);
    const sshFlag = `ssh -o StrictHostKeyChecking=accept-new`;
    shellCmd = `exec mosh --ssh='${sshFlag}' ${target} -- bash -c ${shellEscape(command)}`;
  } else {
    const target = sshTarget(machine);
    const optsStr = SSH_OPTS.map((o) => `'${o}'`).join(" ");
    shellCmd = `exec ssh -t ${optsStr} ${target} ${shellEscape(command)}`;
  }

  // If the shell wrapper is active, write the command to the exec file and
  // exit with code 10. The wrapper will exec the command after Bun exits,
  // giving SSH a clean TTY with no stdin contention.
  if (process.env.NPDEV_EXEC_FILE) {
    await Bun.write(process.env.NPDEV_EXEC_FILE, shellCmd);
    process.exit(10);
  }

  // Fallback: Bun.spawn with /dev/tty redirect (on-VPS local exec, or direct invocation without wrapper)
  const proc = Bun.spawn(["bash", "-c", `exec < /dev/tty; stty sane 2>/dev/null; ${shellCmd}`], {
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}

/** Upload a file to the VPS via scp (remote) or cp (on-VPS) */
export async function scpUpload(
  machine: Machine,
  localPath: string,
  remotePath: string,
): Promise<{ exitCode: number; error?: string }> {
  // Ensure destination directory exists
  const remoteDir = remotePath.replace(/\/[^/]+$/, "");
  await sshExec(machine, `mkdir -p '${remoteDir}'`);

  const args = isOnVPS()
    ? ["cp", localPath, remotePath]
    : ["scp", ...SSH_OPTS, localPath, `${sshTarget(machine)}:${remotePath}`];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, error: exitCode !== 0 ? stderr.trim() || "Upload failed" : undefined };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
