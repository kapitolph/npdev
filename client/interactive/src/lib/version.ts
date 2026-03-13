import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { npdevDir } from "./config";
import type { VersionInfo } from "../types";

export const NPDEV_VERSION = "1.1.4";
const GITHUB_REPO = "kapitolph/npdev";

function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return false;
}

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
      // Only report as "latest" if it's actually newer than current
      const effective = cachedVersion && isNewer(cachedVersion, NPDEV_VERSION) ? cachedVersion : null;
      return { current: NPDEV_VERSION, latest: effective };
    }
  } catch {
    // No cache
  }

  // Fetch and wait (with timeout so it doesn't hang)
  const fetched = await fetchLatestVersion(cacheFile, now);
  const effective = fetched && isNewer(fetched, NPDEV_VERSION) ? fetched : null;
  return { current: NPDEV_VERSION, latest: effective };
}

async function fetchLatestVersion(cacheFile: string, now: number): Promise<string | null> {
  try {
    // Use GitHub API to get latest release tag (not source file) to avoid
    // race with CI: source shows pre-bump version until CI commits the bump
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: "application/vnd.github+json" },
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { tag_name?: string };
    const tag = data.tag_name;
    if (!tag) return null;
    const latest = tag.replace(/^v/, "");
    await mkdir(npdevDir(), { recursive: true });
    await writeFile(cacheFile, `${now}\n${latest}\n`);
    return latest;
  } catch {
    return null;
  }
}
