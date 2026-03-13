import * as p from "@clack/prompts";
import type { Machine } from "../types";
import { cmdSetup } from "../commands/setup";
import { cmdUpdate } from "../commands/update";
import { cmdStart } from "../commands/start";
import { cmdList } from "../commands/list";
import { cmdCleanup } from "../commands/cleanup";

export async function mainMenu(machine: Machine, npdevUser: string, machineOverride?: string): Promise<void> {
  while (true) {
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "new-session", label: "New session", hint: "create or attach to a named tmux session" },
        { value: "list", label: "List sessions", hint: "show active sessions on VPS" },
        { value: "cleanup", label: "Cleanup sessions", hint: "interactively end old sessions" },
        { value: "setup", label: "Setup", hint: "configure developer identity" },
        { value: "update", label: "Update", hint: "fetch latest npdev + machines" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("Bye!");
      process.exit(0);
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

        const desc = await p.text({
          message: "Description (optional)",
          defaultValue: "",
        });
        if (p.isCancel(desc)) break;

        await cmdStart(machine, name, npdevUser, desc || undefined);
        break;
      }
      case "list":
        await cmdList(machine);
        console.log();
        break;
      case "cleanup":
        await cmdCleanup(machine, npdevUser);
        console.log();
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
