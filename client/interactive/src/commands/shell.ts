import { sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

export async function cmdShell(machine: Machine, npdevUser: string): Promise<void> {
  const cmd = `NPDEV_USER='${npdevUser}' exec $SHELL -l`;
  const exitCode = await sshInteractive(machine, cmd);
  process.exit(exitCode);
}
