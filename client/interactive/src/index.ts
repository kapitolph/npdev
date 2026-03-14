import { hostname } from "node:os";
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
import { cmdSyncKeys } from "./commands/sync-keys";
import { cmdUpdate } from "./commands/update";
import { isOnVPS, loadConfig, loadMachines } from "./lib/config";
import { selectMachine } from "./lib/machine";
import { isMoshInstalled } from "./lib/mosh";
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

Setup & Maintenance:
  npdev setup                     Set up developer identity (git + GitHub)
  npdev sync-keys                 Sync keys/*.pub from GitHub to VPS
  npdev update                    Update npdev binary + machine list

Global Flags:
  --json                          Output JSON (for scripts and agents)
  --user <name>                   Override developer identity
  --machine <name>                Select VPS when multiple configured
  --old                           Use classic menu (fallback)
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

  update: `npdev update

Update the npdev binary and machines.yaml from the latest GitHub release.`,
};

interface ParsedArgs {
  command: string;
  remaining: string[];
  flags: {
    json: boolean;
    machine?: string;
    user?: string;
    old: boolean;
    desc?: string;
    repo?: string;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let machine: string | undefined;
  let user: string | undefined;
  let desc: string | undefined;
  let repo: string | undefined;
  let json = false;
  let old = false;
  const remaining: string[] = [];

  let i = 0;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--machine":
        machine = argv[++i];
        if (!machine) { console.error("--machine requires a name"); process.exit(1); }
        break;
      case "--user":
        user = argv[++i];
        if (!user) { console.error("--user requires a name"); process.exit(1); }
        break;
      case "--desc":
        desc = argv[++i];
        if (!desc) { console.error("--desc requires a value"); process.exit(1); }
        break;
      case "--repo":
        repo = argv[++i];
        if (!repo) { console.error("--repo requires a path"); process.exit(1); }
        break;
      case "--json":
        json = true;
        break;
      case "--old":
        old = true;
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
    flags: { json, machine, user, old, desc, repo },
  };
}

async function main(): Promise<void> {
  const { command, remaining, flags } = parseArgs(process.argv.slice(2));

  // Commands that don't need full config
  if (command === "update") {
    await cmdUpdate();
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
    console.error("npdev not configured. Run: npdev update (or bash client/setup.sh from repo)");
    process.exit(1);
  }

  // Version check (non-blocking, skip for JSON/non-interactive)
  const versionPromise = flags.json ? Promise.resolve({ current: NPDEV_VERSION, latest: null }) : checkVersion();

  // Select machine (skip on VPS)
  const getMachine = async (): Promise<Machine> => {
    if (isOnVPS()) {
      return { name: hostname(), host: "localhost", user: "dev", description: "local" };
    }
    return selectMachine(flags.machine);
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
        if (!reloaded.npdevUser) { console.error("Setup incomplete."); process.exit(1); }
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
      if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
      const machine = await getMachine();
      await cmdShell(machine, npdevUser);
    }
    return;
  }

  // npdev - : resume most recent
  if (command === "-") {
    if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
    const machine = await getMachine();
    const sessions = await fetchSessions(machine);
    const mine = sessions
      .filter((s) => s.owner === npdevUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
    if (mine.length === 0) { console.error("No active sessions."); process.exit(1); }
    await cmdStart(machine, mine[0].name, npdevUser, undefined, undefined, moshOpts);
    process.exit(0);
  }

  // npdev . : session from current git branch
  if (command === ".") {
    if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "pipe" });
    const branch = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !branch || branch === "HEAD") {
      console.error("Not on a git branch (detached HEAD or not a repo).");
      process.exit(1);
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
    if (!name) { console.error("Usage: npdev start <name> [--desc \"...\"] [--repo <path>]"); process.exit(1); }
    if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
    const machine = await getMachine();
    await cmdStart(machine, name, npdevUser, flags.desc, flags.repo, moshOpts);
    process.exit(0);
  }

  // npdev end <name>
  if (command === "end") {
    const name = remaining[0];
    if (!name) { console.error("Usage: npdev end <name>"); process.exit(1); }
    const machine = await getMachine();
    await cmdEnd(machine, name);
    return;
  }

  // npdev describe <name> <desc>
  if (command === "describe") {
    const name = remaining[0];
    const desc = remaining.slice(1).join(" ") || flags.desc;
    if (!name || !desc) { console.error("Usage: npdev describe <name> <description>"); process.exit(1); }
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
    if (!nameOrPath) { console.error("Usage: npdev repo <name|path> [--json]"); process.exit(1); }
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

  // Default: treat as session name (npdev my-feature [description...])
  if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
  const machine = await getMachine();
  const description = remaining.join(" ") || undefined;
  await cmdStart(machine, command, npdevUser, description, undefined, moshOpts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
