// npdev version — auto-incremented by CI on each release
import type { ReleaseInfo, VersionInfo } from "../types";

export const NPDEV_VERSION = "1.1.81";
const GITHUB_REPO = "kapitolph/npdev";

export function isNewer(a: string, b: string): boolean {
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

export function parseChannel(version: string): "stable" | "nightly" {
  return version.includes("-nightly.") ? "nightly" : "stable";
}

export function baseVersion(version: string): string {
  return version.replace(/-nightly\..+$/, "");
}

export function relativeTimeFromISO(iso: string): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function nightlyDateSuffix(version: string): string | null {
  const match = version.match(/-nightly\.(\d{8})$/);
  return match ? match[1] : null;
}

export async function checkVersion(): Promise<VersionInfo> {
  const channel = parseChannel(NPDEV_VERSION);
  const base = baseVersion(NPDEV_VERSION);

  try {
    const headers = { Accept: "application/vnd.github+json" };
    const timeout = AbortSignal.timeout(3000);

    // Fetch stable and recent releases in parallel
    const [stableResp, listResp] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        signal: timeout,
        headers,
      }).catch(() => null),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, {
        signal: timeout,
        headers,
      }).catch(() => null),
    ]);

    // Parse stable release
    let latestStable: ReleaseInfo | null = null;
    if (stableResp?.ok) {
      const data = (await stableResp.json()) as { tag_name?: string; published_at?: string };
      if (data.tag_name) {
        latestStable = {
          version: data.tag_name.replace(/^v/, ""),
          publishedAt: data.published_at || "",
        };
      }
    }

    // Parse nightly from releases list
    let latestNightly: ReleaseInfo | null = null;
    if (listResp?.ok) {
      const releases = (await listResp.json()) as Array<{
        tag_name?: string;
        prerelease?: boolean;
        published_at?: string;
      }>;
      for (const rel of releases) {
        if (rel.prerelease && rel.tag_name?.includes("-nightly.")) {
          latestNightly = {
            version: rel.tag_name.replace(/^v/, ""),
            publishedAt: rel.published_at || "",
          };
          break; // first match is most recent
        }
      }
    }

    // Compute backward-compat `latest` field
    let latest: string | null = null;
    if (latestStable) {
      if (channel === "nightly") {
        // On nightly, only show stable update if stable is newer than the nightly base
        if (isNewer(latestStable.version, base)) {
          latest = latestStable.version;
        }
      } else if (isNewer(latestStable.version, base)) {
        latest = latestStable.version;
      }
    }

    return { current: NPDEV_VERSION, latest, latestStable, latestNightly, channel };
  } catch {
    return {
      current: NPDEV_VERSION,
      latest: null,
      latestStable: null,
      latestNightly: null,
      channel,
    };
  }
}
