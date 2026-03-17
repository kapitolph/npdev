import { usageError } from "../lib/errors";
import { sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

export async function cmdEnd(machine: Machine, name: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw usageError("Session name must contain only letters, numbers, hyphens, and underscores.", {
      name,
    });
  }

  const exitCode = await sshInteractive(machine, `bash ~/.vps/session.sh end '${name}'`);
  process.exit(exitCode);
}
