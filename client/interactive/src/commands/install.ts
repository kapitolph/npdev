import { copyFile, chmod, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/dev";
const REPO_SERVER_DIR = join(HOME, "npdev/server");
const VPS_DIR = join(HOME, ".vps");
const BASHRC = join(HOME, ".bashrc");

interface Installable {
  src: string;
  dest: string;
  mode?: string;
  /** Shell integration file to install to ~/.vps/ and source from .bashrc */
  shell?: string;
}

const INSTALLABLE: Record<string, Installable> = {
  ccp: {
    src: "claude-profile.sh",
    dest: "claude-profile.sh",
    mode: "0755",
    shell: "ccp-shell.sh",
  },
  cxp: {
    src: "codex-profile.sh",
    dest: "codex-profile.sh",
    mode: "0755",
    shell: "cxp-shell.sh",
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

/** Marker comments used to fence sourced blocks in .bashrc */
function markers(name: string) {
  return {
    begin: `# >>> npdev ${name} >>>`,
    end: `# <<< npdev ${name} <<<`,
  };
}

/**
 * Ensure .bashrc sources the shell integration file.
 * Uses begin/end markers so re-running replaces the block idempotently.
 */
async function installShellIntegration(
  name: string,
  shellFile: string,
  json: boolean,
): Promise<string | null> {
  const shellSrc = join(REPO_SERVER_DIR, shellFile);
  const shellDest = join(VPS_DIR, shellFile);

  if (!existsSync(shellSrc)) {
    return `Shell source not found: ${shellSrc}`;
  }

  // Copy shell file to ~/.vps/
  await copyFile(shellSrc, shellDest);

  // Build the fenced block
  const { begin, end } = markers(name);
  const block = `${begin}\nsource "${shellDest}"\n${end}`;

  let bashrc = await readFile(BASHRC, "utf-8");

  // Replace existing block or append
  const re = new RegExp(
    `${begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  if (re.test(bashrc)) {
    bashrc = bashrc.replace(re, block);
  } else {
    bashrc = bashrc.trimEnd() + "\n\n" + block + "\n";
  }

  await writeFile(BASHRC, bashrc);
  if (!json) console.log(`  Shell integration → ${shellDest} (sourced in .bashrc)`);
  return null;
}

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
      if (!opts.json) console.log(`Installed ${name} → ${dest}`);

      // Install shell integration if defined
      if (entry.shell) {
        const shellErr = await installShellIntegration(name, entry.shell, !!opts.json);
        if (shellErr) {
          results.push({ name, ok: false, error: shellErr });
          continue;
        }
      }

      results.push({ name, ok: true });
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
