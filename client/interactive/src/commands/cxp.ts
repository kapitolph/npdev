import { existsSync } from "node:fs";
import { join } from "node:path";
import { scpUpload, sshExec, sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

const REMOTE_SCRIPT = "~/.vps/codex-profile.sh";

async function ensureScript(machine: Machine): Promise<void> {
  const localPath = join(import.meta.dir, "../../../../server/codex-profile.sh");
  if (existsSync(localPath)) {
    const result = await scpUpload(machine, localPath, "/home/dev/.vps/codex-profile.sh");
    if (result.exitCode !== 0) throw new Error(`Failed to sync cxp: ${result.error}`);
    await sshExec(machine, `chmod +x ${REMOTE_SCRIPT}`);
  } else {
    const { exitCode } = await sshExec(machine, `test -f ${REMOTE_SCRIPT}`);
    if (exitCode !== 0) throw new Error("cxp script not found on VPS. Run 'npdev install cxp' on the VPS.");
  }
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
