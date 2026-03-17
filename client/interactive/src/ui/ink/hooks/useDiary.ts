import { useCallback, useEffect, useState } from "react";
import { type DiaryData, fetchDiary } from "../../../lib/diary";
import type { Machine } from "../../../types";

interface UseDiaryResult {
  diary: DiaryData;
  loading: boolean;
  refresh: () => void;
}

export function useDiary(machine: Machine): UseDiaryResult {
  const [diary, setDiary] = useState<DiaryData>({ latest3h: null, latestEod: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDiary(machine);
      setDiary(data);
    } catch {
      // silently fail — diary is non-critical
    }
    setLoading(false);
  }, [machine.host]);

  useEffect(() => {
    load();
  }, [load]);

  return { diary, loading, refresh: load };
}
