export interface Machine {
  name: string;
  host: string;
  user: string;
  description: string;
}

export interface Config {
  npdevUser: string;
  moshEnabled: boolean;
}

export interface SessionData {
  name: string;
  type: string;
  description: string;
  owner: string;
  created_at: string;
  last_activity: string;
  client_count: string;
  attached_users?: string;
  pane_cwd?: string;
}

export interface RepoData {
  path: string;
  name: string;
  branch: string;
}

export interface CommitData {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface ReleaseInfo {
  version: string;       // "1.1.37" or "1.1.36-nightly.20260316"
  publishedAt: string;   // ISO 8601 from GitHub API
}

export interface VersionInfo {
  current: string;
  latest: string | null;              // backward compat (latest stable version string or null)
  latestStable: ReleaseInfo | null;   // latest stable release info
  latestNightly: ReleaseInfo | null;  // latest nightly release info (null if none exist)
  channel: "stable" | "nightly";     // derived from NPDEV_VERSION
}

export interface SummaryJsonlRecord {
  timestamp: string;
  label: string;
  signals: string;
  collaborators: string;
  capabilities: string;
  state: string;
  significance: string;
  questions: string;
}
