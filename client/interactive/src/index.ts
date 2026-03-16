import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { hostname, homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { cmdDescribe } from "./commands/describe";
import { cmdEnd } from "./commands/end";
import { cmdRepoInfo } from "./commands/repo-info";
import { cmdReposList } from "./commands/repos-list";
import { cmdSessions } from "./commands/sessions";
import { cmdSessionsList } from "./commands/sessions-list";
import { cmdSetup } from "./commands/setup";
import { cmdShell } from "./commands/shell";
import { cmdStart } from "./commands/start";
import { cmdStatus } from "./commands/status";
import {
  cmdSummariesGenerate,
  cmdSummariesGet,
  cmdSummariesLatest,
  cmdSummariesList,
} from "./commands/summaries";
import { cmdSyncKeys } from "./commands/sync-keys";
import { cmdUpdate, WRAPPER_SCRIPT } from "./commands/update";
import { isOnVPS, loadConfig, loadMachines } from "./lib/config";
import {
  EXIT_CODES,
  renderError,
  usageError,
  configError,
  notFoundError,
} from "./lib/errors";
import { selectMachine } from "./lib/machine";
import { isMoshInstalled } from "./lib/mosh";
import { buildCapabilitiesDocument, buildSpecDocument, findCommandSpec } from "./lib/spec";
import type { SummaryWindow } from "./lib/summaries";
import { fetchSessions } from "./lib/sessions";
import { checkVersion, NPDEV_VERSION } from "./lib/version";
import type { Machine } from "./types";
import { mainMenu } from "./ui/menu";

const USAGE = `npdev — NextPay Dev VPS CLI  v${NPDEV_VERSION}

Usage:
  npdev                           Interactive dashboard (TUI)
  npdev <session-name> [desc]     Create or attach to named tmux session
  npdev -                         Resume most recent session
  npdev .                         Session from current git branch

Session Management:
  npdev sessions [--json]         List all sessions
  npdev start <name> [--desc ".."] [--repo <path>]
                                  Start or attach to a session
  npdev end <name>                End (kill) a session
  npdev describe <name> <desc>    Update session description

Repository Info:
  npdev repos [--json]            List git repos on VPS
  npdev repo <name|path> [--json] Show repo detail + sessions + commits

VPS Overview:
  npdev status [--json]           Sessions, repos, who's online

Summaries:
  npdev summaries list [--json]                     List generated summaries
  npdev summaries latest [--json]                   Get newest generated summary
  npdev summaries get --id <id> [--json]            Get one summary by id
  npdev summaries generate --window 3h|daily [--json]
                                                    Generate a summary

Setup & Maintenance:
  npdev setup                     Set up developer identity (git + GitHub)
  npdev sync-keys                 Sync keys/*.pub from GitHub to VPS
  npdev update [--nightly]        Update npdev binary + machine list
  npdev spec --json               Show agent-facing CLI contract
  npdev spec command <path> --json
                                  Show one command contract
  npdev capabilities --json       Show non-interactive capabilities

Global Flags:
  --json                          Output JSON (for scripts and agents)
  --user <name>                   Override developer identity
  --machine <name>                Select VPS when multiple configured
  --old                           Use classic menu (fallback)
  --id <summary-id>               Summary id for "summaries get"
  --window 3h|daily               Window for "summaries generate"
  --nightly                       Install latest nightly pre-release
  --version, -v                   Show version
  --help, -h                      Show this help

Pair Programming:
  Two people running the same session name share the terminal.

Inside a Session:
  Ctrl+B, D                       Detach (session stays alive)`;

const COMMANDS_HELP: Record<string, string> = {
  sessions: `npdev sessions [--json]

List all active sessions on the VPS.

Flags:
  --json    Output as JSON array (for scripts/agents)

Examples:
  npdev sessions
  npdev sessions --json
  npdev sessions --json | jq '.[] | select(.owner == "don")'`,

  start: `npdev start <name> [flags]

Create a new tmux session or attach to an existing one.

Flags:
  --desc <description>    Session description
  --repo <path>           Start session in this repo directory

Examples:
  npdev start my-feature
  npdev start api-work --desc "working on auth endpoints"
  npdev start bugfix --repo /home/dev/nextpay-v3-business`,

  end: `npdev end <name>

End (kill) a tmux session and mark it as ended in the registry.

Examples:
  npdev end my-feature`,

  describe: `npdev describe <name> <description>

Update the description of an active session.

Examples:
  npdev describe my-feature "refactoring auth middleware"`,

  repos: `npdev repos [--json]

List all git repositories found on the VPS.

Flags:
  --json    Output as JSON array with session counts and active users

Examples:
  npdev repos
  npdev repos --json`,

  repo: `npdev repo <name|path> [--json]

Show detailed info about a repo: branch, sessions inside it, recent commits.

Arguments:
  <name|path>    Repo name (e.g. "npdev") or full path

Flags:
  --json    Output as JSON object

Examples:
  npdev repo npdev
  npdev repo /home/dev/nextpay-v3-business --json`,

  status: `npdev status [--json]

Show VPS overview: who's online, session summary, repo summary.

Flags:
  --json    Output as JSON object with full session and repo data

Examples:
  npdev status
  npdev status --json`,

  setup: `npdev setup

Interactive setup for developer identity. Configures:
  - Local NPDEV_USER config
  - VPS developer env file (git name, email, GitHub token)
  - Git credential helper`,

  "sync-keys": `npdev sync-keys

Fetch SSH public keys from the GitHub repo and add any new ones
to ~/.ssh/authorized_keys on the VPS.`,

  update: `npdev update [--nightly]

Update the npdev binary and machines.yaml from the latest GitHub release.

Flags:
  --nightly    Install the latest nightly pre-release instead of stable`,

  summaries: `npdev summaries <list|latest|get|generate> [flags]

Non-interactive access to generated diary summaries on the VPS.

Examples:
  npdev summaries list --json
  npdev summaries latest --json
  npdev summaries get --id 3h-2026-03-15T06:55 --json
  npdev summaries generate --window daily --json`,

  spec: `npdev spec --json
npdev spec command <path> --json

Show the machine-readable contract for the non-interactive CLI.`,

  capabilities: `npdev capabilities --json

Show the machine-readable list of non-interactive capabilities.`,
};

interface ParsedArgs {
  command: string;
  remaining: string[];
  flags: {
    json: boolean;
    machine?: string;
    user?: string;
    old: boolean;
    nightly: boolean;
    desc?: string;
    repo?: string;
    id?: string;
    window?: string;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let machine: string | undefined;
  let user: string | undefined;
  let desc: string | undefined;
  let repo: string | undefined;
  let id: string | undefined;
  let window: string | undefined;
  let json = false;
  let old = false;
  let nightly = false;
  const remaining: string[] = [];

  let i = 0;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--machine":
        machine = argv[++i];
        if (!machine) throw usageError("--machine requires a name");
        break;
      case "--user":
        user = argv[++i];
        if (!user) throw usageError("--user requires a name");
        break;
      case "--desc":
        desc = argv[++i];
        if (!desc) throw usageError("--desc requires a value");
        break;
      case "--repo":
        repo = argv[++i];
        if (!repo) throw usageError("--repo requires a path");
        break;
      case "--id":
        id = argv[++i];
        if (!id) throw usageError("--id requires a summary id");
        break;
      case "--window":
        window = argv[++i];
        if (!window) throw usageError("--window requires a value");
        break;
      case "--json":
        json = true;
        break;
      case "--old":
        old = true;
        break;
      case "--nightly":
        nightly = true;
        break;
      case "--version":
      case "-v":
        console.log(`npdev ${NPDEV_VERSION}`);
        process.exit(0);
        break;
      case "--help":
      case "-h": {
        // If there's a command before --help, show command-specific help
        const cmd = remaining[0];
        if (cmd && COMMANDS_HELP[cmd]) {
          console.log(COMMANDS_HELP[cmd]);
        } else {
          console.log(USAGE);
        }
        process.exit(0);
        break;
      }
      default:
        remaining.push(argv[i]);
    }
    i++;
  }

  return {
    command: remaining[0] || "",
    remaining: remaining.slice(1),
    flags: { json, machine, user, old, nightly, desc, repo, id, window },
  };
}

/**
 * Auto-bootstrap the wrapper on first client run.
 * When the binary is running directly (no NPDEV_EXEC_FILE), install:
 *   - npdev-core at ~/.npdev/bin/npdev-core
 *   - wrapper script at ~/.local/bin/npdev
 * Skips if npdev-core already exists (already bootstrapped) or on VPS.
 */
async function ensureWrapperInstalled(): Promise<void> {
  // Already running via wrapper, or on the VPS — nothing to do
  if (process.env.NPDEV_EXEC_FILE || isOnVPS()) return;

  const coreBinDir = join(homedir(), ".npdev", "bin");
  const corePath = join(coreBinDir, "npdev-core");

  // Already bootstrapped
  if (existsSync(corePath)) return;

  try {
    // Copy the running binary to ~/.npdev/bin/npdev-core
    await mkdir(coreBinDir, { recursive: true });
    const selfPath = process.execPath;
    await copyFile(selfPath, corePath);
    await chmod(corePath, 0o755);

    // Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
    if (process.platform === "darwin") {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`codesign -s - "${corePath}"`, { stdio: "ignore" });
      } catch {}
    }

    // Write wrapper script atomically to ~/.local/bin/npdev
    const wrapperDir = join(homedir(), ".local", "bin");
    const wrapperPath = join(wrapperDir, "npdev");
    const tmpPath = `${wrapperPath}.tmp.${process.pid}`;
    await mkdir(wrapperDir, { recursive: true });
    await writeFile(tmpPath, WRAPPER_SCRIPT);
    await chmod(tmpPath, 0o755);
    await rename(tmpPath, wrapperPath);
  } catch {
    // Non-fatal — the stdin.destroy() fallback handles this run
  }
}

function printJson(doc: Record<string, unknown>): void {
  console.log(JSON.stringify(doc, null, 2));
}

async function main(): Promise<void> {
  const { command, remaining, flags } = parseArgs(process.argv.slice(2));

  // Auto-bootstrap wrapper for future runs (non-blocking for this run)
  await ensureWrapperInstalled();

  // Commands that don't need full config
  if (command === "spec") {
    if (remaining[0] === "command") {
      const path = remaining.slice(1).join(" ");
      if (!path) throw usageError("Usage: npdev spec command <path> --json");
      const spec = findCommandSpec(path);
      if (!spec) throw notFoundError(`Unknown command path: ${path}`, { path });
      printJson({
        contract_version: buildSpecDocument().contract_version,
        command: spec,
      });
      process.exit(0);
    }
    printJson(buildSpecDocument());
    process.exit(0);
  }
  if (command === "capabilities") {
    printJson(buildCapabilitiesDocument());
    process.exit(0);
  }
  if (command === "update") {
    await cmdUpdate({ nightly: flags.nightly });
    process.exit(0);
  }
  if (command === "setup") {
    await cmdSetup(flags.machine);
    process.exit(0);
  }
  if (command === "help") {
    const topic = remaining[0];
    if (topic && COMMANDS_HELP[topic]) {
      console.log(COMMANDS_HELP[topic]);
    } else {
      console.log(USAGE);
    }
    process.exit(0);
  }

  // Load config
  const config = await loadConfig();
  let npdevUser =
    flags.user || config.npdevUser || (isOnVPS() ? process.env.GIT_AUTHOR_NAME : undefined) || "";

  // Check machines exist
  const machines = await loadMachines();
  if (machines.length === 0 && !isOnVPS()) {
    throw configError("npdev not configured. Run: npdev update (or bash client/setup.sh from repo)");
  }

  // Version check (non-blocking, skip for JSON/non-interactive)
  const versionPromise = flags.json
    ? Promise.resolve({ current: NPDEV_VERSION, latest: null, latestStable: null, latestNightly: null, channel: "stable" as const })
    : checkVersion();

  // Select machine (skip on VPS)
  const getMachine = async (): Promise<Machine> => {
    if (isOnVPS()) {
      return { name: hostname(), host: "localhost", user: "dev", description: "local" };
    }
    return selectMachine(flags.machine, { interactive: process.stdin.isTTY && !flags.json });
  };

  const moshOpts = config.moshEnabled && !isOnVPS() && isMoshInstalled() ? { mosh: true } : undefined;

  // --- Command dispatch ---

  // No command: interactive dashboard
  if (command === "") {
    const isTTY = process.stdin.isTTY;
    if (isTTY) {
      if (!npdevUser) {
        p.log.warn("Developer identity not set. Let's fix that.");
        await cmdSetup(flags.machine);
        const reloaded = await loadConfig();
        if (!reloaded.npdevUser) throw configError("Setup incomplete.");
        npdevUser = reloaded.npdevUser;
      }
      const version = await versionPromise;
      const machine = await getMachine();
      if (flags.old) {
        await mainMenu(machine, npdevUser, version, flags.machine);
      } else {
        const { renderInkDashboard } = await import("./ui/ink/render");
        await renderInkDashboard(machine, npdevUser, version, config.moshEnabled);
      }
    } else {
      if (!npdevUser) throw configError("Developer identity not set. Run: npdev setup");
      const machine = await getMachine();
      await cmdShell(machine, npdevUser);
    }
    return;
  }

  // npdev - : resume most recent
  if (command === "-") {
    if (!npdevUser) throw configError("Developer identity not set. Run: npdev setup");
    const machine = await getMachine();
    const sessions = await fetchSessions(machine);
    const mine = sessions
      .filter((s) => s.owner === npdevUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
    if (mine.length === 0) throw usageError("No active sessions.");
    await cmdStart(machine, mine[0].name, npdevUser, undefined, undefined, moshOpts);
    process.exit(0);
  }

  // npdev . : session from current git branch
  if (command === ".") {
    if (!npdevUser) throw configError("Developer identity not set. Run: npdev setup");
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "pipe" });
    const branch = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !branch || branch === "HEAD") {
      throw usageError("Not on a git branch (detached HEAD or not a repo).");
    }
    const sessionName = branch.replace(/\//g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
    const machine = await getMachine();
    await cmdStart(machine, sessionName, npdevUser, `branch: ${branch}`, undefined, moshOpts);
    process.exit(0);
  }

  // npdev sessions [--json]
  if (command === "sessions") {
    const machine = await getMachine();
    if (flags.json || !process.stdin.isTTY) {
      await cmdSessionsList(machine, { json: flags.json });
    } else {
      await cmdSessions(machine, npdevUser || "unknown");
    }
    process.exit(0);
  }

  // npdev list (legacy alias for sessions)
  if (command === "list") {
    const machine = await getMachine();
    if (flags.json || !process.stdin.isTTY) {
      await cmdSessionsList(machine, { json: flags.json });
    } else {
      await cmdSessions(machine, npdevUser || "unknown");
    }
    process.exit(0);
  }

  // npdev start <name> [--desc ".."] [--repo <path>]
  if (command === "start") {
    const name = remaining[0];
    if (!name) throw usageError("Usage: npdev start <name> [--desc \"...\"] [--repo <path>]");
    if (!npdevUser) throw configError("Developer identity not set. Run: npdev setup");
    const machine = await getMachine();
    await cmdStart(machine, name, npdevUser, flags.desc, flags.repo, moshOpts);
    process.exit(0);
  }

  // npdev end <name>
  if (command === "end") {
    const name = remaining[0];
    if (!name) throw usageError("Usage: npdev end <name>");
    const machine = await getMachine();
    await cmdEnd(machine, name);
    return;
  }

  // npdev describe <name> <desc>
  if (command === "describe") {
    const name = remaining[0];
    const desc = remaining.slice(1).join(" ") || flags.desc;
    if (!name || !desc) throw usageError("Usage: npdev describe <name> <description>");
    const machine = await getMachine();
    await cmdDescribe(machine, name, desc);
    return;
  }

  // npdev repos [--json]
  if (command === "repos") {
    const machine = await getMachine();
    await cmdReposList(machine, { json: flags.json });
    process.exit(0);
  }

  // npdev repo <name|path> [--json]
  if (command === "repo") {
    const nameOrPath = remaining[0];
    if (!nameOrPath) throw usageError("Usage: npdev repo <name|path> [--json]");
    const machine = await getMachine();
    await cmdRepoInfo(machine, nameOrPath, { json: flags.json });
    process.exit(0);
  }

  // npdev status [--json]
  if (command === "status") {
    const machine = await getMachine();
    await cmdStatus(machine, { json: flags.json });
    process.exit(0);
  }

  // npdev sync-keys
  if (command === "sync-keys") {
    const machine = await getMachine();
    await cmdSyncKeys(machine);
    process.exit(0);
  }

  if (command === "summaries") {
    const subcommand = remaining[0];
    if (!subcommand) throw usageError("Usage: npdev summaries <list|latest|get|generate> [flags]");
    const machine = await getMachine();
    if (subcommand === "list") {
      await cmdSummariesList(machine, { json: flags.json });
      process.exit(0);
    }
    if (subcommand === "latest") {
      await cmdSummariesLatest(machine, { json: flags.json });
      process.exit(0);
    }
    if (subcommand === "get") {
      if (!flags.id) throw usageError("Usage: npdev summaries get --id <summary-id> [--json]");
      await cmdSummariesGet(machine, flags.id, { json: flags.json });
      process.exit(0);
    }
    if (subcommand === "generate") {
      if (flags.window !== "3h" && flags.window !== "daily") {
        throw usageError("Usage: npdev summaries generate --window 3h|daily [--json]");
      }
      await cmdSummariesGenerate(machine, flags.window as SummaryWindow, { json: flags.json });
      process.exit(0);
    }
    throw usageError(`Unknown summaries subcommand: ${subcommand}`, { subcommand });
  }

  // Default: treat as session name (npdev my-feature [description...])
  if (!npdevUser) throw configError("Developer identity not set. Run: npdev setup");
  const machine = await getMachine();
  const description = remaining.join(" ") || undefined;
  await cmdStart(machine, command, npdevUser, description, undefined, moshOpts);
}

main().catch((err) => {
  const jsonRequested = process.argv.includes("--json");
  const rendered = renderError(err, jsonRequested);
  process.exit(rendered.exitCode ?? EXIT_CODES.internal);
});
