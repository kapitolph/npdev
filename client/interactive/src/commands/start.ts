import { sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

export async function cmdStart(
  machine: Machine,
  name: string,
  npdevUser: string,
  description?: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error(
      "Error: Session name must contain only letters, numbers, hyphens, and underscores.",
    );
    process.exit(1);
  }

  const desc = description || "(no description)";
  const cmd = `bash ~/.vps/session.sh start '${name}' 'shell' '${desc}' '${npdevUser}'`;
  const exitCode = await sshInteractive(machine, cmd);
  process.exit(exitCode);
}
