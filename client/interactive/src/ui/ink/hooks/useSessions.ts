import { useCallback, useEffect, useState } from "react";
import { businessDaysElapsed, fetchSessions, STALE_BUSINESS_DAYS } from "../../../lib/sessions";
import type { Machine, SessionData } from "../../../types";

interface UseSessionsResult {
  sessions: SessionData[];
  mine: SessionData[];
  team: SessionData[];
  stale: SessionData[];
  loading: boolean;
  refresh: () => void;
  removeSession: (name: string) => void;
  silentRefresh: () => Promise<void>;
}

export function useSessions(machine: Machine, npdevUser: string): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchSessions(machine);
    setSessions(data);
    setLoading(false);
  }, [machine.host]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = sessions
    .filter((s) => s.owner === npdevUser)
    .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));

  const team = sessions
    .filter((s) => s.owner !== npdevUser)
    .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));

  const stale = mine.filter((s) => businessDaysElapsed(s.last_activity) > STALE_BUSINESS_DAYS);

  const removeSession = useCallback((name: string) => {
    setSessions((prev) => prev.filter((s) => s.name !== name));
  }, []);

  const silentRefresh = useCallback(async () => {
    const data = await fetchSessions(machine);
    setSessions(data);
  }, [machine.host]);

  return { sessions, mine, team, stale, loading, refresh: load, removeSession, silentRefresh };
}
