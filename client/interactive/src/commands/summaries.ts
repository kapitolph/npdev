import type { Machine } from "../types";
import {
  type SummaryWindow,
  formatSummary,
  formatSummaryList,
  generateSummary,
  getSummary,
  latestSummary,
  listSummaries,
} from "../lib/summaries";

export async function cmdSummariesList(machine: Machine, opts: { json?: boolean } = {}): Promise<void> {
  const list = await listSummaries(machine);
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  console.log(formatSummaryList(list));
}

export async function cmdSummariesLatest(machine: Machine, opts: { json?: boolean } = {}): Promise<void> {
  const summary = await latestSummary(machine);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatSummary(summary));
}

export async function cmdSummariesGet(
  machine: Machine,
  id: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  const summary = await getSummary(machine, id);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatSummary(summary));
}

export async function cmdSummariesGenerate(
  machine: Machine,
  window: SummaryWindow,
  opts: { json?: boolean } = {},
): Promise<void> {
  const result = await generateSummary(machine, window);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.output.trim());
  console.log("");
  console.log(formatSummary(result.summary));
}
