export interface Machine {
  name: string;
  host: string;
  user: string;
  description: string;
}

export interface Config {
  npdevUser: string;
}

export interface SessionData {
  name: string;
  type: string;
  description: string;
  owner: string;
  created_at: string;
  last_activity: string;
}

export interface VersionInfo {
  current: string;
  latest: string | null;
}
