import React from "react";
import { render } from "ink";
import type { Machine, VersionInfo } from "../../types";
import { App } from "./App";
import type { AppAction } from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { getTheme } from "./theme";
import { isOnVPS } from "../../lib/config";
import { cmdStart } from "../../commands/start";
import { cmdSetup } from "../../commands/setup";
import { cmdUpdate } from "../../commands/update";

export async function renderInkDashboard(
  machine: Machine,
  npdevUser: string,
  version: VersionInfo,
  machineOverride?: string
): Promise<void> {
  // Bun workaround: stdin must be resumed for Ink to read input
  process.stdin.resume();

  const onVPS = isOnVPS();
  const theme = getTheme(onVPS ? "local" : "remote");

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
          case "update":
            await cmdUpdate();
            renderInkDashboard(machine, npdevUser, version, machineOverride).then(resolve, reject);
            break;
          case "exit":
            console.log("Bye!");
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
        })
      )
    );

    instance.waitUntilExit().then(resolve);
  });
}
