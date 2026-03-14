import { sshExec } from "../lib/ssh";
import type { Machine } from "../types";

export async function cmdDescribe(machine: Machine, name: string, description: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error("Error: Session name must contain only letters, numbers, hyphens, and underscores.");
    process.exit(1);
  }

  const safeDesc = description.replace(/'/g, "'\\''");
  const { stdout, exitCode } = await sshExec(machine, `bash ~/.vps/session.sh describe '${name}' '${safeDesc}'`);
  if (stdout) console.log(stdout);
  process.exit(exitCode);
}
