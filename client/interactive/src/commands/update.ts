import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { MACHINES_FILE, npdevDir } from "../lib/config";

const GITHUB_REPO = "kapitolph/npdev";

export async function cmdUpdate(): Promise<void> {
  p.intro("Updating npdev");

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

  // Fetch latest version from GitHub releases
  let newVersion = "unknown";
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

  // Update binary
  s.start("Fetching latest npdev binary");
  try {
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/npdev-${os}-${arch}`;
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    const execPath = process.execPath;
    const tmpPath = `${execPath}.tmp`;
    // Write to temp file then atomically replace — overwriting a running
    // binary in-place corrupts it on macOS (Mach-O is memory-mapped)
    await writeFile(tmpPath, Buffer.from(buffer));
    await chmod(tmpPath, 0o755);
    try {
      await unlink(execPath);
    } catch {}
    await rename(tmpPath, execPath);
    // Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
    if (process.platform === "darwin") {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`codesign -s - "${execPath}"`, { stdio: "ignore" });
      } catch {}
    }
    s.stop("npdev binary updated");
  } catch {
    s.stop("Failed to fetch binary (may not be released yet — using current version)");
  }

  p.outro(`npdev is now at v${newVersion}`);
}
