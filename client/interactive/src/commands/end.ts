import type { Machine } from "../types";
import { sshInteractive } from "../lib/ssh";

export async function cmdEnd(machine: Machine, name: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error("Error: Session name must contain only letters, numbers, hyphens, and underscores.");
    process.exit(1);
  }

  const exitCode = await sshInteractive(machine, `bash ~/.vps/session.sh end '${name}'`);
  process.exit(exitCode);
}
