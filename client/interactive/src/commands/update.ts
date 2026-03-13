import * as p from "@clack/prompts";
import { writeFile, chmod, mkdir } from "fs/promises";
import { MACHINES_FILE, npdevDir } from "../lib/config";
import { NPDEV_VERSION } from "../lib/version";

const GITHUB_REPO = "kapitolph/dev-vps";

export async function cmdUpdate(): Promise<void> {
  p.intro("Updating npdev");

  const s = p.spinner();

  // Update machines.yaml
  s.start("Fetching machines.yaml");
  try {
    const resp = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const content = await resp.text();
    await mkdir(npdevDir(), { recursive: true });
    await writeFile(MACHINES_FILE, content);
    s.stop("machines.yaml updated");
  } catch (e) {
    s.stop("Failed to fetch machines.yaml");
    process.exit(1);
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
    await writeFile(execPath, Buffer.from(buffer));
    await chmod(execPath, 0o755);
    s.stop("npdev binary updated");
  } catch {
    s.stop("Failed to fetch binary (may not be released yet — using current version)");
  }

  p.outro(`npdev is at v${NPDEV_VERSION}`);
}
