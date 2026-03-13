import { hostname } from "node:os";
import * as p from "@clack/prompts";
import { cmdEnd } from "./commands/end";
import { cmdSessions } from "./commands/sessions";
import { cmdSetup } from "./commands/setup";
import { cmdShell } from "./commands/shell";
import { cmdStart } from "./commands/start";
import { cmdSyncKeys } from "./commands/sync-keys";
import { cmdUpdate } from "./commands/update";
import { isOnVPS, loadConfig, loadMachines } from "./lib/config";
import { selectMachine } from "./lib/machine";
import { fetchSessions } from "./lib/sessions";
import { checkVersion, NPDEV_VERSION } from "./lib/version";
import type { Machine } from "./types";
import { mainMenu } from "./ui/menu";

const USAGE = `npdev — NextPay Dev VPS CLI

Usage:
  npdev                           Interactive dashboard
  npdev <session-name> [desc]     Create or attach to named tmux session
  npdev -                         Resume most recent session
  npdev .                         Session from current git branch
  npdev list                      List all sessions
  npdev end <session-name>        End a session
  npdev setup                     Set up your developer identity (git + GitHub)
  npdev sync-keys                 Sync keys/*.pub from GitHub to VPS
  npdev update                    Update npdev + machines from GitHub
  npdev --user <name> ...         Override developer identity
  npdev --machine <name> ...      Select VPS when multiple configured
  npdev --old                     Use classic menu (fallback)
  npdev --version                 Show version
  npdev --help                    Show this help

Pair programming:
  Two people running the same session name share the terminal.

Inside a session:
  Ctrl+B, D                       Detach (session stays alive)`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let machineOverride: string | undefined;
  let userOverride: string | undefined;
  let useOldMenu = false;
  const remaining: string[] = [];

  // Parse global flags
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--machine":
        machineOverride = args[++i];
        if (!machineOverride) {
          console.error("--machine requires a name");
          process.exit(1);
        }
        break;
      case "--user":
        userOverride = args[++i];
        if (!userOverride) {
          console.error("--user requires a name");
          process.exit(1);
        }
        break;
      case "--old":
        useOldMenu = true;
        break;
      case "--version":
      case "-v":
        console.log(`npdev ${NPDEV_VERSION}`);
        process.exit(0);
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        remaining.push(args[i]);
    }
    i++;
  }

  const command = remaining[0] || "";

  // Commands that don't need full config
  if (command === "update") {
    await cmdUpdate();
    process.exit(0);
  }
  if (command === "setup") {
    await cmdSetup(machineOverride);
    process.exit(0);
  }

  // Load config
  const config = await loadConfig();
  let npdevUser =
    userOverride || config.npdevUser || (isOnVPS() ? process.env.GIT_AUTHOR_NAME : undefined) || "";

  // Check machines exist
  const machines = await loadMachines();
  if (machines.length === 0 && !isOnVPS()) {
    console.error("npdev not configured. Run: npdev update (or bash client/setup.sh from repo)");
    process.exit(1);
  }

  // Version check (non-blocking)
  const versionPromise = checkVersion();

  // Select machine (skip on VPS)
  const getMachine = async (): Promise<Machine> => {
    if (isOnVPS()) {
      return { name: hostname(), host: "localhost", user: "dev", description: "local" };
    }
    return selectMachine(machineOverride);
  };

  // Route commands
  if (command === "") {
    const isTTY = process.stdin.isTTY;
    if (isTTY) {
      // First-run: inline setup if no identity
      if (!npdevUser) {
        p.log.warn("Developer identity not set. Let's fix that.");
        await cmdSetup(machineOverride);
        const reloaded = await loadConfig();
        if (!reloaded.npdevUser) {
          console.error("Setup incomplete.");
          process.exit(1);
        }
        npdevUser = reloaded.npdevUser;
      }

      const version = await versionPromise;
      const machine = await getMachine();
      if (useOldMenu) {
        await mainMenu(machine, npdevUser, version, machineOverride);
      } else {
        const { renderInkDashboard } = await import("./ui/ink/render");
        await renderInkDashboard(machine, npdevUser, version);
      }
    } else {
      // Non-TTY: quick shell (preserves bash behavior)
      if (!npdevUser) {
        console.error("Developer identity not set. Run: npdev setup");
        process.exit(1);
      }
      const machine = await getMachine();
      await cmdShell(machine, npdevUser);
    }
    return;
  }

  // npdev - : resume most recent session
  if (command === "-") {
    if (!npdevUser) {
      console.error("Developer identity not set. Run: npdev setup");
      process.exit(1);
    }
    const machine = await getMachine();
    const sessions = await fetchSessions(machine);
    const mine = sessions
      .filter((s) => s.owner === npdevUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
    if (mine.length === 0) {
      console.error("No active sessions.");
      process.exit(1);
    }
    await cmdStart(machine, mine[0].name, npdevUser);
    process.exit(0);
  }

  // npdev . : session from current git branch
  if (command === ".") {
    if (!npdevUser) {
      console.error("Developer identity not set. Run: npdev setup");
      process.exit(1);
    }
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const branch = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !branch || branch === "HEAD") {
      console.error("Not on a git branch (detached HEAD or not a repo).");
      process.exit(1);
    }
    const sessionName = branch.replace(/\//g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
    const machine = await getMachine();
    await cmdStart(machine, sessionName, npdevUser, `branch: ${branch}`);
    process.exit(0);
  }

  if (command === "list") {
    const machine = await getMachine();
    const npUser = npdevUser || "unknown";
    if (process.stdin.isTTY) {
      await cmdSessions(machine, npUser);
    } else {
      // Non-interactive: just print table via ssh (legacy behavior)
      const { sshExec } = await import("./lib/ssh");
      const { stdout } = await sshExec(machine, "bash ~/.vps/session.sh list");
      if (stdout) console.log(stdout);
    }
    process.exit(0);
  }

  if (command === "sync-keys") {
    const machine = await getMachine();
    await cmdSyncKeys(machine);
    process.exit(0);
  }

  if (command === "end") {
    const sessionName = remaining[1];
    if (!sessionName) {
      console.error("Usage: npdev end <session-name>");
      process.exit(1);
    }
    const machine = await getMachine();
    await cmdEnd(machine, sessionName);
    return;
  }

  // Default: treat as session name (npdev my-feature [description...])
  if (!npdevUser) {
    console.error("Developer identity not set. Run: npdev setup");
    process.exit(1);
  }
  const machine = await getMachine();
  const sessionName = command;
  const description = remaining.slice(1).join(" ") || undefined;
  await cmdStart(machine, sessionName, npdevUser, description);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
