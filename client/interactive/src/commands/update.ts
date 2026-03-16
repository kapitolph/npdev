import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { MACHINES_FILE, npdevDir } from "../lib/config";

const GITHUB_REPO = "kapitolph/npdev";

export const WRAPPER_SCRIPT = `#!/usr/bin/env bash
NPDEV_CORE="\${HOME}/.npdev/bin/npdev-core"
[ -x "$NPDEV_CORE" ] || { echo "npdev-core not found. Run: npdev update" >&2; exit 1; }
export NPDEV_EXEC_FILE="/tmp/npdev-exec-$$"
"$NPDEV_CORE" "$@"
exit_code=$?
if [ "$exit_code" -eq 10 ] && [ -f "$NPDEV_EXEC_FILE" ]; then
  cmd=$(cat "$NPDEV_EXEC_FILE")
  rm -f "$NPDEV_EXEC_FILE"
  stty sane 2>/dev/null
  exec bash -c "$cmd"
fi
rm -f "$NPDEV_EXEC_FILE"
exit $exit_code
`;

interface UpdateOptions {
  nightly?: boolean;
}

async function findLatestNightlyTag(): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return null;
    const releases = (await resp.json()) as Array<{
      tag_name?: string;
      prerelease?: boolean;
    }>;
    for (const rel of releases) {
      if (rel.prerelease && rel.tag_name?.includes("-nightly.")) {
        return rel.tag_name;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function cmdUpdate(options: UpdateOptions = {}): Promise<void> {
  const isNightly = options.nightly ?? false;
  p.intro(isNightly ? "Updating npdev (nightly)" : "Updating npdev");

  const s = p.spinner();

  // Update machines.yaml
  s.start("Fetching machines.yaml");
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const content = await resp.text();
    await mkdir(npdevDir(), { recursive: true });
    await writeFile(MACHINES_FILE, content);
    s.stop("machines.yaml updated");
  } catch (_e) {
    s.stop("Failed to fetch machines.yaml");
    process.exit(1);
  }

  // Determine download URL and version
  let newVersion = "unknown";
  let downloadTag: string | null = null;

  if (isNightly) {
    s.start("Finding latest nightly release");
    const tag = await findLatestNightlyTag();
    if (!tag) {
      s.stop("No nightly releases found");
      process.exit(1);
    }
    downloadTag = tag;
    newVersion = tag.replace(/^v/, "");
    s.stop(`Found nightly: ${tag}`);
  } else {
    // Stable: fetch latest version info
    try {
      const vResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: "application/vnd.github+json" },
      });
      if (vResp.ok) {
        const data = (await vResp.json()) as { tag_name?: string };
        if (data.tag_name) newVersion = data.tag_name.replace(/^v/, "");
      }
    } catch {
      // continue with "unknown"
    }
  }

  // Update binary → ~/.npdev/bin/npdev-core
  s.start(`Fetching ${isNightly ? "nightly" : "latest"} npdev binary`);
  const coreBinDir = join(homedir(), ".npdev", "bin");
  const corePath = join(coreBinDir, "npdev-core");
  try {
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const url = isNightly && downloadTag
      ? `https://github.com/${GITHUB_REPO}/releases/download/${downloadTag}/npdev-${os}-${arch}`
      : `https://github.com/${GITHUB_REPO}/releases/latest/download/npdev-${os}-${arch}`;
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    await mkdir(coreBinDir, { recursive: true });
    const tmpPath = `${corePath}.tmp`;
    // Write to temp file then atomically replace — overwriting a running
    // binary in-place corrupts it on macOS (Mach-O is memory-mapped)
    await writeFile(tmpPath, Buffer.from(buffer));
    await chmod(tmpPath, 0o755);
    try {
      await unlink(corePath);
    } catch {}
    await rename(tmpPath, corePath);
    // Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
    if (process.platform === "darwin") {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`codesign -s - "${corePath}"`, { stdio: "ignore" });
      } catch {}
    }
    s.stop("npdev-core binary updated");
  } catch {
    s.stop("Failed to fetch binary (may not be released yet — using current version)");
  }

  // Generate wrapper script at ~/.local/bin/npdev
  s.start("Installing wrapper script");
  const wrapperDir = join(homedir(), ".local", "bin");
  const wrapperPath = join(wrapperDir, "npdev");
  try {
    await mkdir(wrapperDir, { recursive: true });
    await writeFile(wrapperPath, WRAPPER_SCRIPT);
    await chmod(wrapperPath, 0o755);
    s.stop("Wrapper script installed");
  } catch {
    s.stop("Failed to install wrapper script");
  }

  const channelLabel = isNightly ? " (nightly)" : "";
  p.outro(`npdev is now at v${newVersion}${channelLabel}`);
}
