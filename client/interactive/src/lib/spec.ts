import { EXIT_CODES } from "./errors";

export const JSON_CONTRACT_VERSION = "2026-03-16";

export interface CommandSpec {
  path: string;
  summary: string;
  aliases?: string[];
  interactive_safe: boolean;
  json: {
    supported: boolean;
    shape: string;
  };
  arguments?: string[];
  options?: Array<{
    name: string;
    values?: string[];
    required?: boolean;
  }>;
  exit_codes?: number[];
  examples?: string[];
}

const EXIT_CODE_DETAILS = [
  { code: EXIT_CODES.ok, name: "ok", meaning: "Success." },
  { code: EXIT_CODES.internal, name: "internal", meaning: "Unexpected internal failure." },
  { code: EXIT_CODES.usage, name: "usage", meaning: "Invalid arguments or unsupported combination." },
  { code: EXIT_CODES.config, name: "config", meaning: "Missing local npdev configuration or identity." },
  { code: EXIT_CODES.notFound, name: "not_found", meaning: "Requested resource was not found." },
  { code: EXIT_CODES.noData, name: "no_data", meaning: "Operation completed but produced no new summary data." },
  { code: EXIT_CODES.remote, name: "remote", meaning: "Remote SSH/VPS command failed." },
  { code: EXIT_CODES.invalidData, name: "invalid_data", meaning: "Remote data was malformed or unsupported." },
];

export const COMMAND_SPECS: CommandSpec[] = [
  {
    path: "capabilities",
    summary: "Describe the non-interactive features agents can rely on.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok],
    examples: ["npdev capabilities --json"],
  },
  {
    path: "spec",
    summary: "Return the agent-facing CLI contract, including commands and exit codes.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok],
    examples: ["npdev spec --json"],
  },
  {
    path: "spec command",
    summary: "Return the contract for one command path.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    arguments: ["<path>"],
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.notFound, EXIT_CODES.usage],
    examples: ["npdev spec command summaries get --json"],
  },
  {
    path: "sessions",
    aliases: ["list"],
    summary: "List active tmux sessions.",
    interactive_safe: true,
    json: { supported: true, shape: "array" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev sessions --json"],
  },
  {
    path: "repos",
    summary: "List discovered git repositories on the VPS.",
    interactive_safe: true,
    json: { supported: true, shape: "array" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev repos --json"],
  },
  {
    path: "repo",
    summary: "Show one repository with sessions and commits.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    arguments: ["<name|path>"],
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.notFound, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev repo npdev --json"],
  },
  {
    path: "status",
    summary: "Show session and repository overview for the VPS.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev status --json"],
  },
  {
    path: "summaries list",
    summary: "List known generated diary summaries from 3h and daily windows.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev summaries list --json"],
  },
  {
    path: "summaries latest",
    summary: "Return the newest available generated diary summary.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.notFound, EXIT_CODES.remote, EXIT_CODES.invalidData],
    examples: ["npdev summaries latest --json"],
  },
  {
    path: "summaries get",
    summary: "Return one generated diary summary by id.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--id", required: true }, { name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.notFound, EXIT_CODES.remote, EXIT_CODES.invalidData, EXIT_CODES.usage],
    examples: ["npdev summaries get --id 3h-2026-03-15T06:55 --json"],
  },
  {
    path: "summaries generate",
    summary: "Generate a new diary summary via the existing heartbeat diary script.",
    interactive_safe: true,
    json: { supported: true, shape: "object" },
    options: [{ name: "--window", values: ["3h", "daily"], required: true }, { name: "--json" }],
    exit_codes: [EXIT_CODES.ok, EXIT_CODES.noData, EXIT_CODES.remote, EXIT_CODES.invalidData, EXIT_CODES.usage],
    examples: ["npdev summaries generate --window 3h --json"],
  },
];

export function normalizeCommandPath(path: string): string {
  return path
    .trim()
    .toLowerCase()
    .replace(/[/.]+/g, " ")
    .replace(/\s+/g, " ");
}

export function findCommandSpec(path: string): CommandSpec | undefined {
  const normalized = normalizeCommandPath(path);
  return COMMAND_SPECS.find((command) => {
    if (normalizeCommandPath(command.path) === normalized) return true;
    return (command.aliases ?? []).some((alias) => normalizeCommandPath(alias) === normalized);
  });
}

export function buildSpecDocument(): Record<string, unknown> {
  return {
    contract_version: JSON_CONTRACT_VERSION,
    json_error_shape: {
      ok: false,
      error: {
        code: "string",
        message: "string",
        exit_code: "number",
        details: "object",
      },
    },
    exit_codes: EXIT_CODE_DETAILS,
    commands: COMMAND_SPECS,
  };
}

export function buildCapabilitiesDocument(): Record<string, unknown> {
  return {
    contract_version: JSON_CONTRACT_VERSION,
    interactive_dashboard_preserved: true,
    top_level_nouns: ["capabilities", "spec", "sessions", "repos", "repo", "status", "summaries"],
    summary_windows: ["3h", "daily"],
    discoverability: {
      spec: "npdev spec --json",
      spec_command: "npdev spec command <path> --json",
      capabilities: "npdev capabilities --json",
    },
    compatibility: {
      json_surface_is_versioned: true,
      note: "Successful JSON payloads are command-specific. Error payloads use the shared json_error_shape.",
    },
  };
}
