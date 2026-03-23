import { useCallback, useEffect, useState } from "react";
import { sshExec } from "../../../lib/ssh";
import type { Machine } from "../../../types";

export interface Profile {
  name: string;
  email: string;
  has_credentials: boolean;
  token_status: string;
  active: boolean;
}

interface UseProfilesResult {
  profiles: Profile[];
  current: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useProfiles(machine: Machine): UseProfilesResult {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { stdout, exitCode } = await sshExec(
        machine,
        "bash ~/.vps/claude-profile.sh list --json",
      );
      if (exitCode === 0 && stdout) {
        const parsed = JSON.parse(stdout);
        if (parsed.ok) {
          setProfiles(parsed.profiles ?? []);
          setCurrent(parsed.current ?? null);
        } else {
          setProfiles([]);
          setCurrent(null);
        }
      } else {
        setProfiles([]);
        setCurrent(null);
      }
    } catch {
      setProfiles([]);
      setCurrent(null);
    }
    setLoading(false);
  }, [machine.host]);

  useEffect(() => {
    load();
  }, [load]);

  return { profiles, current, loading, refresh: load };
}
