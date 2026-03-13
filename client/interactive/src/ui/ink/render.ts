import { render } from "ink";
import React from "react";
import { cmdSetup } from "../../commands/setup";
import { cmdStart } from "../../commands/start";
import { cmdUpdate } from "../../commands/update";
import { isOnVPS } from "../../lib/config";
import type { Machine, VersionInfo } from "../../types";
import type { AppAction } from "./App";
import { App } from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { getTheme } from "./theme";

export async function renderInkDashboard(
  machine: Machine,
  npdevUser: string,
  version: VersionInfo,
  machineOverride?: string,
): Promise<void> {
  // Bun workaround: stdin must be resumed for Ink to read input
  process.stdin.resume();

  const onVPS = isOnVPS();
  const theme = getTheme();

  return new Promise<void>((resolve, reject) => {
    let instance: ReturnType<typeof render>;

    const handleAction = async (action: AppAction) => {
      try {
        // Unmount Ink before taking over the terminal
        instance.unmount();
        // Allow Ink to fully release stdin
        process.stdin.pause();
        process.stdin.removeAllListeners();

        switch (action.type) {
          case "resume":
          case "new-session":
          case "join-team":
            await cmdStart(machine, action.sessionName, npdevUser);
            resolve();
            break;
          case "setup":
            await cmdSetup(machineOverride);
            renderInkDashboard(machine, npdevUser, version, machineOverride).then(resolve, reject);
            break;
          case "update": {
            await cmdUpdate();
            // Re-exec the (now-updated) binary so the new version is loaded
            const args = process.argv.slice(1);
            const child = Bun.spawn([process.execPath, ...args], {
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            });
            const code = await child.exited;
            process.exit(code);
            break;
          }
          case "exit":
            // Clear Ink output so terminal returns to previous state
            process.stdout.write("\x1B[2J\x1B[H");
            process.exit(0);
        }
      } catch (err) {
        reject(err);
      }
    };

    instance = render(
      React.createElement(
        ThemeProvider,
        { value: theme },
        React.createElement(App, {
          machine,
          npdevUser,
          version,
          isOnVPS: onVPS,
          onAction: handleAction,
        }),
      ),
    );

    instance.waitUntilExit().then(resolve);
  });
}
