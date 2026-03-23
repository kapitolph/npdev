import { render } from "ink";
import React from "react";
import { cmdStart } from "../../commands/start";
import { isOnVPS, loadConfig } from "../../lib/config";
import { isMoshInstalled } from "../../lib/mosh";
import { sshInteractive } from "../../lib/ssh";
import type { Machine, VersionInfo } from "../../types";
import type { AppAction } from "./App";
import { App } from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { getTheme } from "./theme";

export async function renderInkDashboard(
  machine: Machine,
  npdevUser: string,
  version: VersionInfo,
  initialMoshEnabled = false,
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
        // Release stdin so Bun's event loop stops polling it
        process.stdin.removeAllListeners();
        process.stdin.setRawMode?.(false);
        process.stdin.destroy(); // Close the fd — Bun stops polling stdin

        // Re-read config to get current mosh toggle state
        const config = await loadConfig();
        const useMosh = !onVPS && config.moshEnabled && isMoshInstalled();
        if (!onVPS && config.moshEnabled && !isMoshInstalled()) {
          console.warn("Warning: mosh enabled but not installed — falling back to SSH");
        }
        const moshOpts = useMosh ? { mosh: true } : undefined;

        switch (action.type) {
          case "resume":
          case "new-session":
          case "join-team":
            await cmdStart(machine, action.sessionName, npdevUser, undefined, undefined, moshOpts);
            resolve();
            break;
          case "new-session-in-repo":
            await cmdStart(
              machine,
              action.sessionName,
              npdevUser,
              undefined,
              action.repoPath,
              moshOpts,
            );
            resolve();
            break;
          case "cd-to-repo": {
            const envCmd = `source ~/.vps/developers/${npdevUser}.env 2>/dev/null; `;
            await sshInteractive(
              machine,
              `${envCmd}cd '${action.repoPath}' && exec $SHELL -l`,
              moshOpts,
            );
            resolve();
            break;
          }
          case "ccp-login":
            await sshInteractive(
              machine,
              `bash ~/.vps/claude-profile.sh login '${action.profileName}'`,
              moshOpts,
            );
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
          initialMoshEnabled: !onVPS && initialMoshEnabled,
          onAction: handleAction,
        }),
      ),
    );

    instance.waitUntilExit().then(resolve);
  });
}
