import { copyFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/dev";
const REPO_SERVER_DIR = join(HOME, "npdev/server");
const VPS_DIR = join(HOME, ".vps");

const INSTALLABLE: Record<string, { src: string; dest: string; mode?: string }> = {
  ccp: {
    src: "claude-profile.sh",
    dest: "claude-profile.sh",
    mode: "0755",
  },
  session: {
    src: "session.sh",
    dest: "session.sh",
    mode: "0755",
  },
  tmux: {
    src: "tmux.conf",
    dest: "tmux.conf",
  },
  "login-proxy": {
    src: "claude-login-proxy.sh",
    dest: "claude-login-proxy.sh",
    mode: "0755",
  },
  "login-worker": {
    src: "claude-login-worker.py",
    dest: "claude-login-worker.py",
    mode: "0755",
  },
};

export async function cmdInstall(targets: string[], opts: { json?: boolean }): Promise<void> {
  if (targets.length === 0 || targets[0] === "all") {
    targets = Object.keys(INSTALLABLE);
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const name of targets) {
    const entry = INSTALLABLE[name];
    if (!entry) {
      const msg = `Unknown target '${name}'. Available: ${Object.keys(INSTALLABLE).join(", ")}, all`;
      if (opts.json) {
        results.push({ name, ok: false, error: msg });
        continue;
      }
      console.error(`ERROR: ${msg}`);
      process.exit(1);
    }

    const src = join(REPO_SERVER_DIR, entry.src);
    const dest = join(VPS_DIR, entry.dest);

    if (!existsSync(src)) {
      const msg = `Source not found: ${src}`;
      if (opts.json) {
        results.push({ name, ok: false, error: msg });
        continue;
      }
      console.error(`ERROR: ${msg}`);
      process.exit(1);
    }

    try {
      await copyFile(src, dest);
      if (entry.mode) await chmod(dest, entry.mode);
      results.push({ name, ok: true });
      if (!opts.json) console.log(`Installed ${name} → ${dest}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        results.push({ name, ok: false, error: msg });
      } else {
        console.error(`ERROR installing ${name}: ${msg}`);
        process.exit(1);
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }));
  }
}
