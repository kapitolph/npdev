import {
  formatSummary,
  formatSummaryList,
  generateSummary,
  getSummary,
  latestSummary,
  listSummaries,
  type SummaryWindow,
} from "../lib/summaries";
import type { Machine } from "../types";

export async function cmdSummariesList(
  machine: Machine,
  opts: { json?: boolean; repo?: string } = {},
): Promise<void> {
  const list = await listSummaries(machine, opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  console.log(formatSummaryList(list));
}

export async function cmdSummariesLatest(
  machine: Machine,
  opts: { json?: boolean; repo?: string } = {},
): Promise<void> {
  const summary = await latestSummary(machine, opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatSummary(summary));
}

export async function cmdSummariesGet(
  machine: Machine,
  id: string,
  opts: { json?: boolean; repo?: string } = {},
): Promise<void> {
  const summary = await getSummary(machine, id, opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatSummary(summary));
}

export async function cmdSummariesGenerate(
  machine: Machine,
  window: SummaryWindow,
  opts: { json?: boolean; repo?: string } = {},
): Promise<void> {
  const result = await generateSummary(machine, window, opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.output.trim());
  console.log("");
  console.log(formatSummary(result.summary));
}
