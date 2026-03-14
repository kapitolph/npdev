import { platform } from "node:os";

export function isMoshInstalled(): boolean {
  const result = Bun.spawnSync(["which", "mosh"]);
  return result.exitCode === 0;
}

export async function installMosh(): Promise<{ success: boolean; error?: string }> {
  const os = platform();
  const args =
    os === "darwin"
      ? ["brew", "install", "mosh"]
      : ["sudo", "apt-get", "install", "-y", "mosh"];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return { success: false, error: stderr.trim() || `Install failed (exit ${exitCode})` };
  }
  return { success: true };
}
