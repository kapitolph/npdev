import { sshExec } from "../lib/ssh";
import { remoteError, usageError } from "../lib/errors";
import type { Machine } from "../types";

export async function cmdDescribe(machine: Machine, name: string, description: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw usageError("Session name must contain only letters, numbers, hyphens, and underscores.", {
      name,
    });
  }

  const safeDesc = description.replace(/'/g, "'\\''");
  const { stdout, exitCode } = await sshExec(machine, `bash ~/.vps/session.sh describe '${name}' '${safeDesc}'`);
  if (exitCode !== 0) {
    throw remoteError("Failed to update session description.", { name, exit_code: exitCode });
  }
  if (stdout) console.log(stdout);
}
