import type { Machine, SummaryJsonlRecord } from "../types";
import { sshExec } from "./ssh";

export interface DiaryData {
  latest3h: SummaryJsonlRecord | null;
  latestEod: SummaryJsonlRecord | null;
}

export async function fetchDiary(machine: Machine): Promise<DiaryData> {
  // Fetch last line of each JSONL file in parallel
  const [res3h, resEod] = await Promise.all([
    sshExec(machine, "tail -1 /home/dev/brain/latest-3h.jsonl 2>/dev/null || echo ''"),
    sshExec(machine, "tail -1 /home/dev/brain/latest-daily.jsonl 2>/dev/null || echo ''"),
  ]);

  let latest3h: SummaryJsonlRecord | null = null;
  let latestEod: SummaryJsonlRecord | null = null;

  try {
    if (res3h.stdout.trim()) latest3h = JSON.parse(res3h.stdout.trim());
  } catch { /* ignore parse errors */ }

  try {
    if (resEod.stdout.trim()) latestEod = JSON.parse(resEod.stdout.trim());
  } catch { /* ignore parse errors */ }

  return { latest3h, latestEod };
}
