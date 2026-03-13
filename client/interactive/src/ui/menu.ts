import * as p from "@clack/prompts";
import chalk from "chalk";
import { cmdSessions } from "../commands/sessions";
import { cmdSetup } from "../commands/setup";
import { cmdStart } from "../commands/start";
import { cmdUpdate } from "../commands/update";
import { activityAge, fetchSessions, relativeTime } from "../lib/sessions";
import { sshExec } from "../lib/ssh";
import type { Machine, SessionData, VersionInfo } from "../types";

export async function mainMenu(
  machine: Machine,
  npdevUser: string,
  version: VersionInfo,
  machineOverride?: string,
): Promise<void> {
  while (true) {
    // Fetch sessions with spinner
    const spin = p.spinner();
    spin.start("Loading dashboard");
    const sessions = await fetchSessions(machine);
    spin.stop();

    const mine = sessions
      .filter((s) => s.owner === npdevUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
    const team = sessions
      .filter((s) => s.owner !== npdevUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));

    // Header
    const updateNotice = version.latest
      ? chalk.yellow(` · update available: v${version.latest}`)
      : "";
    console.log();
    console.log(
      chalk.bold(`  ${machine.name}`) +
        chalk.dim(` · ${npdevUser} · v${version.current}`) +
        updateNotice,
    );

    // Your sessions
    if (mine.length > 0) {
      console.log();
      console.log(chalk.bold("  Your sessions:"));
      for (const s of mine) {
        const count = parseInt(s.client_count || "0", 10);
        const countStr = count > 0 ? chalk.green(`  ${count} attached`) : "";
        const age = activityAge(s.last_activity);
        const timeColor = age > 3 * 86400 ? chalk.yellow : chalk.dim;
        console.log(
          `    ${chalk.cyan(s.name.padEnd(22))} ${timeColor(relativeTime(s.last_activity).padEnd(12))}${countStr}`,
        );
      }
    }

    // Team sessions (grouped by owner)
    if (team.length > 0) {
      console.log();
      console.log(chalk.bold("  Team:"));
      const byOwner = new Map<string, SessionData[]>();
      for (const s of team) {
        if (!byOwner.has(s.owner)) byOwner.set(s.owner, []);
        byOwner.get(s.owner)?.push(s);
      }
      for (const [owner, ownerSessions] of byOwner) {
        for (let i = 0; i < ownerSessions.length; i++) {
          const s = ownerSessions[i];
          const count = parseInt(s.client_count || "0", 10);
          const countStr = count > 0 ? chalk.green(`  ${count} attached`) : "";
          const ownerLabel = i === 0 ? chalk.dim(owner.padEnd(10)) : " ".repeat(10);
          console.log(
            `    ${ownerLabel} ${s.name.padEnd(22)} ${chalk.dim(relativeTime(s.last_activity).padEnd(12))}${countStr}`,
          );
        }
      }
    }

    // Stale session nudge
    const staleSessions = mine.filter((s) => activityAge(s.last_activity) > 3 * 86400);
    if (staleSessions.length > 0) {
      console.log();
      p.log.warn(
        `You have ${staleSessions.length} stale session(s) (inactive 3+ days): ${staleSessions.map((s) => s.name).join(", ")}`,
      );
      const cleanUp = await p.confirm({
        message: "End stale sessions?",
        initialValue: false,
      });
      if (!p.isCancel(cleanUp) && cleanUp) {
        for (const s of staleSessions) {
          const { exitCode } = await sshExec(machine, `bash ~/.vps/session.sh end '${s.name}'`);
          if (exitCode === 0) {
            p.log.success(`Ended: ${s.name}`);
          } else {
            p.log.error(`Failed to end: ${s.name}`);
          }
        }
        continue; // Re-render dashboard
      }
    }

    console.log();

    // Build select options
    const options: { value: string; label: string; hint?: string }[] = [];

    // Resume own sessions
    for (const s of mine) {
      options.push({
        value: `resume:${s.name}`,
        label: `Resume ${s.name}`,
        hint: relativeTime(s.last_activity),
      });
    }

    // New session
    options.push({
      value: "new-session",
      label: "New session",
      hint: "create a named tmux session",
    });

    // Join team session
    if (team.length > 0) {
      options.push({
        value: "join-team",
        label: "Join team session",
        hint: `${team.length} session(s)`,
      });
    }

    // Manage, setup, update, exit
    if (sessions.length > 0) {
      options.push({
        value: "manage",
        label: "Manage sessions",
        hint: "view, filter, end sessions",
      });
    }
    options.push({ value: "setup", label: "Setup", hint: "configure developer identity" });

    const hasUpdate = version.latest && version.latest !== version.current;
    options.push({
      value: "update",
      label: hasUpdate ? "Update (new version!)" : "Update",
      hint: hasUpdate ? `v${version.latest} available` : "fetch latest npdev + machines",
    });
    options.push({ value: "exit", label: "Exit" });

    const action = await p.select({
      message: "What would you like to do?",
      options,
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("Bye!");
      process.exit(0);
    }

    if (typeof action === "string" && action.startsWith("resume:")) {
      const sessionName = action.slice("resume:".length);
      await cmdStart(machine, sessionName, npdevUser);
      break;
    }

    switch (action) {
      case "new-session": {
        const name = await p.text({
          message: "Session name",
          validate: (v) => {
            if (!v) return "Required";
            if (!/^[a-zA-Z0-9_-]+$/.test(v)) return "Only letters, numbers, hyphens, underscores";
            return undefined;
          },
        });
        if (p.isCancel(name)) break;
        await cmdStart(machine, name, npdevUser);
        break;
      }
      case "join-team": {
        const choice = await p.select({
          message: "Which session?",
          options: team.map((s) => ({
            value: s.name,
            label: `${s.name} ${chalk.dim("·")} ${s.owner} ${chalk.dim("·")} ${relativeTime(s.last_activity)}`,
          })),
        });
        if (p.isCancel(choice)) break;
        await cmdStart(machine, choice, npdevUser);
        break;
      }
      case "manage":
        await cmdSessions(machine, npdevUser);
        break;
      case "setup":
        await cmdSetup(machineOverride);
        break;
      case "update":
        await cmdUpdate();
        break;
    }
  }
}
