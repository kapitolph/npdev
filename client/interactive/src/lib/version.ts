import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { npdevDir } from "./config";
import type { VersionInfo } from "../types";

export const NPDEV_VERSION = "1.0.0";
const GITHUB_REPO = "kapitolph/dev-vps";

export async function checkVersion(): Promise<VersionInfo> {
  const cacheFile = join(npdevDir(), ".version-check");
  const now = Math.floor(Date.now() / 1000);
  let latest: string | null = null;

  try {
    const content = await readFile(cacheFile, "utf-8");
    const lines = content.trim().split("\n");
    const lastCheck = parseInt(lines[0], 10);
    const cachedVersion = lines[1] || null;

    if (now - lastCheck < 3600) {
      return { current: NPDEV_VERSION, latest: cachedVersion };
    }
  } catch {
    // No cache
  }

  // Background fetch — don't block
  fetchLatestVersion(cacheFile, now).catch(() => {});

  return { current: NPDEV_VERSION, latest };
}

async function fetchLatestVersion(cacheFile: string, now: number): Promise<void> {
  try {
    const resp = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main/client/interactive/src/lib/version.ts`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!resp.ok) return;
    const text = await resp.text();
    const match = text.match(/NPDEV_VERSION\s*=\s*"([^"]+)"/);
    if (!match) return;
    const latest = match[1];
    await mkdir(npdevDir(), { recursive: true });
    await writeFile(cacheFile, `${now}\n${latest}\n`);
  } catch {
    // Silently fail
  }
}
