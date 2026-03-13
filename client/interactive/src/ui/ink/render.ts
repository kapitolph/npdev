import { render } from "ink";
import React from "react";
import { cmdStart } from "../../commands/start";
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
          case "update-done":
            // Binary was replaced on disk — exit so user restarts with new version
            process.stdout.write("\x1B[2J\x1B[H");
            process.exit(0);
            break;
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
