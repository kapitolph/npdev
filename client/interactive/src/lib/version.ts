// npdev version — auto-incremented by CI on each release
import type { VersionInfo } from "../types";

export const NPDEV_VERSION = "1.1.5";
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
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: "application/vnd.github+json" },
      }
    );
    if (!resp.ok) return { current: NPDEV_VERSION, latest: null };
    const data = await resp.json() as { tag_name?: string };
    const tag = data.tag_name;
    if (!tag) return { current: NPDEV_VERSION, latest: null };
    const latest = tag.replace(/^v/, "");
    return {
      current: NPDEV_VERSION,
      latest: isNewer(latest, NPDEV_VERSION) ? latest : null,
    };
  } catch {
    return { current: NPDEV_VERSION, latest: null };
  }
}
