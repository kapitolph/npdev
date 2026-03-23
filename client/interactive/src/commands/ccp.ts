import { join } from "node:path";
import { scpUpload, sshExec, sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

const REMOTE_SCRIPT = "~/.vps/claude-profile.sh";

async function ensureScript(machine: Machine): Promise<void> {
  const { exitCode } = await sshExec(machine, `test -f ${REMOTE_SCRIPT}`);
  if (exitCode !== 0) {
    const localPath = join(import.meta.dir, "../../../../server/claude-profile.sh");
    const result = await scpUpload(machine, localPath, "/home/dev/.vps/claude-profile.sh");
    if (result.exitCode !== 0) throw new Error(`Failed to install ccp: ${result.error}`);
    await sshExec(machine, `chmod +x ${REMOTE_SCRIPT}`);
  }
}

export async function cmdCcp(
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
