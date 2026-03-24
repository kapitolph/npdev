import { join } from "node:path";
import { scpUpload, sshExec, sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

const REMOTE_SCRIPT = "~/.vps/codex-profile.sh";

async function ensureScript(machine: Machine): Promise<void> {
  const localPath = join(import.meta.dir, "../../../../server/codex-profile.sh");
  const result = await scpUpload(machine, localPath, "/home/dev/.vps/codex-profile.sh");
  if (result.exitCode !== 0) throw new Error(`Failed to sync cxp: ${result.error}`);
  await sshExec(machine, `chmod +x ${REMOTE_SCRIPT}`);
}

export async function cmdCxp(
  machine: Machine,
  subArgs: string[],
  opts: { json?: boolean },
): Promise<void> {
  await ensureScript(machine);
  const escaped = subArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const cmd = `bash ${REMOTE_SCRIPT} ${escaped}`;

  if (opts.json) {
    const { stdout, exitCode } = await sshExec(machine, `${cmd} --json`);
    if (stdout) console.log(stdout.trim());
    if (exitCode !== 0) process.exit(exitCode);
  } else {
    await sshInteractive(machine, cmd);
  }
}
