import { homedir } from "node:os";
import type { Machine } from "../types";
import { invalidDataError, noDataError, notFoundError, remoteError } from "./errors";
import { sshExec } from "./ssh";

export type SummaryWindow = "3h" | "daily";

const VPS_HOME = process.env.NPDEV_VPS_HOME || "/home/dev";
const DIARY_SCRIPT = `${VPS_HOME}/heartbeat/diary/diary`;

function summaryFile(window: SummaryWindow): string {
  return `${VPS_HOME}/brain/${window === "3h" ? "latest-3h.jsonl" : "latest-daily.jsonl"}`;
}

function labelForWindow(window: SummaryWindow): string {
  return window === "3h" ? "Development Log" : "End-of-Day Summary";
}

function sinceForWindow(window: SummaryWindow): string {
  return window === "3h" ? "3 hours ago" : "midnight";
}

function makeSummaryId(window: SummaryWindow, timestamp: string): string {
  return `${window}-${timestamp.replace(" ", "T").replace(/[^0-9T:-]/g, "")}`;
}

export interface SummaryRecord {
  id: string;
  window: SummaryWindow;
  timestamp: string;
  label: string;
  signals: string;
  collaborators: string;
  capabilities: string;
  state: string;
  significance: string;
  questions: string;
  source_file: string;
}

export interface SummaryList {
  items: SummaryRecord[];
}

export function parseSummaryLines(content: string, window: SummaryWindow): SummaryRecord[] {
  const file = summaryFile(window);
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as Omit<SummaryRecord, "id" | "window" | "source_file">;
        if (!parsed.timestamp || !parsed.label) {
          throw invalidDataError("Summary record is missing timestamp or label", { window, line });
        }
        return {
          ...parsed,
          id: makeSummaryId(window, parsed.timestamp),
          window,
          source_file: file,
        };
      } catch (error) {
        throw invalidDataError("Failed to parse summary JSONL", {
          window,
          line,
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    });
}

async function readSummaryFile(machine: Machine, window: SummaryWindow): Promise<SummaryRecord[]> {
  const file = summaryFile(window);
  const { stdout, exitCode } = await sshExec(
    machine,
    `if [[ -f '${file}' ]]; then cat '${file}'; fi`,
  );
  if (exitCode !== 0) {
    throw remoteError("Failed to read summary data from VPS", { window, file, exit_code: exitCode });
  }
  if (!stdout.trim()) return [];
  return parseSummaryLines(stdout, window);
}

export async function listSummaries(machine: Machine): Promise<SummaryList> {
  const [threeHour, daily] = await Promise.all([
    readSummaryFile(machine, "3h"),
    readSummaryFile(machine, "daily"),
  ]);
  const items = [...threeHour, ...daily].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { items };
}

export async function latestSummary(machine: Machine): Promise<SummaryRecord> {
  const { items } = await listSummaries(machine);
  if (items.length === 0) {
    throw notFoundError("No generated summaries are available.");
  }
  return items[0];
}

export async function getSummary(machine: Machine, id: string): Promise<SummaryRecord> {
  const { items } = await listSummaries(machine);
  const summary = items.find((item) => item.id === id);
  if (!summary) {
    throw notFoundError(`Summary not found: ${id}`, { id });
  }
  return summary;
}

export async function generateSummary(
  machine: Machine,
  window: SummaryWindow,
): Promise<{ summary: SummaryRecord; output: string }> {
  const command = `${DIARY_SCRIPT} --since '${sinceForWindow(window)}' --label '${labelForWindow(window)}'`;
  const { stdout, exitCode } = await sshExec(machine, command);

  if (exitCode !== 0) {
    throw remoteError("Summary generation failed on VPS", {
      window,
      exit_code: exitCode,
      output: stdout,
    });
  }

  if (stdout.includes("No commits found")) {
    throw noDataError("No commits found in the requested summary window.", { window });
  }

  const summaries = await readSummaryFile(machine, window);
  const latest = summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  if (!latest) {
    throw invalidDataError("Summary generation reported success but no summary was found afterward.", {
      window,
      output: stdout,
    });
  }

  return {
    summary: latest,
    output: stdout,
  };
}

export function formatSummary(summary: SummaryRecord): string {
  return [
    `${summary.id}  ${summary.window}  ${summary.timestamp}  ${summary.label}`,
    "",
    "Signals Observed",
    summary.signals,
    "",
    "What my collaborators changed",
    summary.collaborators,
    "",
    "What this changed in my capabilities",
    summary.capabilities,
    "",
    "My current state",
    summary.state,
    "",
    "Why this matters for my development",
    summary.significance,
    "",
    "Questions that emerge",
    summary.questions || "(none)",
  ].join("\n");
}

export function formatSummaryList(list: SummaryList): string {
  if (list.items.length === 0) return "No generated summaries.";
  return list.items.map((item) => `${item.id}  ${item.window.padEnd(5)}  ${item.timestamp}  ${item.label}`).join("\n");
}

export function defaultVpsHome(): string {
  return VPS_HOME;
}

export function localHomeForTesting(): string {
  return homedir();
}
