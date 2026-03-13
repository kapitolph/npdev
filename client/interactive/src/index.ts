import { NPDEV_VERSION, checkVersion } from "./lib/version";
import { loadConfig, loadMachines } from "./lib/config";
import { selectMachine } from "./lib/machine";
import { showWelcome } from "./ui/welcome";
import { mainMenu } from "./ui/menu";
import { cmdStart } from "./commands/start";
import { cmdEnd } from "./commands/end";
import { cmdShell } from "./commands/shell";
import { cmdList } from "./commands/list";
import { cmdSetup } from "./commands/setup";
import { cmdUpdate } from "./commands/update";
import { cmdSyncKeys } from "./commands/sync-keys";

const USAGE = `npdev — NextPay Dev VPS CLI

Usage:
  npdev                           Interactive menu (or quick shell if not TTY)
  npdev <session-name> [desc]     Create or attach to named tmux session
  npdev list                      List all sessions
  npdev end <session-name>        End a session
  npdev setup                     Set up your developer identity (git + GitHub)
  npdev sync-keys                 Sync keys/*.pub from GitHub to VPS
  npdev update                    Update npdev + machines from GitHub
  npdev --user <name> ...         Override developer identity
  npdev --machine <name> ...      Select VPS when multiple configured
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
  const remaining: string[] = [];

  // Parse global flags
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--machine":
        machineOverride = args[++i];
        if (!machineOverride) { console.error("--machine requires a name"); process.exit(1); }
        break;
      case "--user":
        userOverride = args[++i];
        if (!userOverride) { console.error("--user requires a name"); process.exit(1); }
        break;
      case "--version":
      case "-v":
        console.log(`npdev ${NPDEV_VERSION}`);
        process.exit(0);
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
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
  const npdevUser = userOverride || config.npdevUser;

  // Check machines exist
  const machines = await loadMachines();
  if (machines.length === 0) {
    console.error("npdev not configured. Run: npdev update (or bash client/setup.sh from repo)");
    process.exit(1);
  }

  // Version check (non-blocking)
  const versionPromise = checkVersion();

  // Route commands
  if (command === "") {
    const isTTY = process.stdin.isTTY;
    if (isTTY) {
      // Interactive menu
      const version = await versionPromise;
      showWelcome(version);

      if (!npdevUser) {
        console.error("Developer identity not set. Run: npdev setup");
        process.exit(1);
      }

      const machine = await selectMachine(machineOverride);
      await mainMenu(machine, npdevUser, machineOverride);
    } else {
      // Non-TTY: quick shell (preserves bash behavior)
      if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
      const machine = await selectMachine(machineOverride);
      await cmdShell(machine, npdevUser);
    }
    return;
  }

  if (command === "list") {
    const machine = await selectMachine(machineOverride);
    await cmdList(machine);
    process.exit(0);
  }

  if (command === "sync-keys") {
    const machine = await selectMachine(machineOverride);
    await cmdSyncKeys(machine);
    process.exit(0);
  }

  if (command === "end") {
    const sessionName = remaining[1];
    if (!sessionName) { console.error("Usage: npdev end <session-name>"); process.exit(1); }
    const machine = await selectMachine(machineOverride);
    await cmdEnd(machine, sessionName);
    return;
  }

  // Default: treat as session name (npdev my-feature [description...])
  if (!npdevUser) { console.error("Developer identity not set. Run: npdev setup"); process.exit(1); }
  const machine = await selectMachine(machineOverride);
  const sessionName = command;
  const description = remaining.slice(1).join(" ") || undefined;
  await cmdStart(machine, sessionName, npdevUser, description);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
