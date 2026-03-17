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

/** Fetch all entries from a JSONL file, newest first */
export async function fetchDiaryEntries(
  machine: Machine,
  type: "3h" | "eod",
): Promise<SummaryJsonlRecord[]> {
  const file = type === "3h"
    ? "/home/dev/brain/latest-3h.jsonl"
    : "/home/dev/brain/latest-daily.jsonl";

  const res = await sshExec(machine, `cat ${file} 2>/dev/null || echo ''`);
  const lines = res.stdout.trim().split("\n").filter(Boolean);

  const entries: SummaryJsonlRecord[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch { /* skip malformed lines */ }
  }

  // Newest first
  entries.reverse();
  return entries;
}
