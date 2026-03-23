import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { sshExec } from "../../../lib/ssh";
import type { Machine } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { useProfiles } from "../hooks/useProfiles";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { Spinner } from "./Spinner";

const PROXY = "bash ~/.vps/claude-login-proxy.sh";

interface Props {
  machine: Machine;
  onBack: () => void;
}

type LoginModal =
  | { profileName: string; email: string; phase: "confirm" }
  | { profileName: string; email: string; phase: "starting" }
  | { profileName: string; email: string; phase: "has-url"; url: string; code: string }
  | { profileName: string; email: string; phase: "submitting" }
  | { profileName: string; email: string; phase: "completing" }
  | { profileName: string; email: string; phase: "done"; message: string }
  | { profileName: string; email: string; phase: "error"; message: string };

export function ProfilesPage({ machine, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const { profiles, loading, refresh } = useProfiles(machine);

  const [profileCursor, setProfileCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [loginModal, setLoginModal] = useState<LoginModal | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxVisible = Math.max(2, Math.floor((rows - 12) / 3));

  useEffect(() => {
    setProfileCursor((c) => Math.min(c, Math.max(0, profiles.length - 1)));
  }, [profiles.length]);

  const showStatus = useCallback((msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const moveCursor = useCallback(
    (delta: number) => {
      setProfileCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, profiles.length - 1));
        setScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + maxVisible) return next - maxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [profiles.length, maxVisible],
  );

  // --- Action handlers ---

  const handleSwitch = useCallback(async () => {
    if (profiles.length === 0 || actionInProgress) return;
    const profile = profiles[profileCursor];
    if (!profile || !profile.has_credentials) {
      showStatus("No saved credentials \u2014 press l to login first");
      return;
    }
    setActionInProgress(true);
    try {
      await sshExec(machine, `bash ~/.vps/claude-profile.sh use '${profile.name}' --json`);
      showStatus(`Switched to ${profile.name}`);
      refresh();
    } catch {
      showStatus("Switch failed");
    }
    setActionInProgress(false);
  }, [profiles, profileCursor, machine, refresh, showStatus, actionInProgress]);

  const handleNext = useCallback(async () => {
    if (profiles.length === 0 || actionInProgress) return;
    setActionInProgress(true);
    try {
      const { stdout } = await sshExec(machine, "bash ~/.vps/claude-profile.sh next --json");
      const parsed = JSON.parse(stdout);
      const nextName = parsed?.profile || "next profile";
      showStatus(`Switched to ${nextName}`);
      refresh();
    } catch {
      showStatus("Cycle failed");
    }
    setActionInProgress(false);
  }, [profiles.length, machine, refresh, showStatus, actionInProgress]);

  const handleRefreshToken = useCallback(async () => {
    if (actionInProgress) return;
    const active = profiles.find((p) => p.active);
    if (!active) {
      showStatus("No active profile to refresh");
      return;
    }
    setActionInProgress(true);
    try {
      await sshExec(machine, `bash ~/.vps/claude-profile.sh save '${active.name}' --force --json`);
      showStatus(`Refreshed token for ${active.name}`);
      refresh();
    } catch {
      showStatus("Token refresh failed");
    }
    setActionInProgress(false);
  }, [profiles, machine, refresh, showStatus, actionInProgress]);

  // --- Login: start via proxy ---

  const handleLoginStart = useCallback(async () => {
    if (!loginModal || loginModal.phase !== "confirm") return;
    const { profileName, email } = loginModal;
    setLoginModal({ profileName, email, phase: "starting" });

    try {
      const emailArg = email ? ` '${email}'` : "";
      const { stdout } = await sshExec(machine, `${PROXY} start${emailArg}`);
      const parsed = JSON.parse(stdout);
      if (!parsed.ok) {
        setLoginModal({ profileName, email, phase: "error", message: parsed.error || "Failed to start" });
        return;
      }
      // Start polling for URL
      setLoginModal({ profileName, email, phase: "starting" });
    } catch {
      setLoginModal({ profileName, email, phase: "error", message: "Failed to start login" });
    }
  }, [loginModal, machine]);

  // --- Login: poll proxy status for URL and completion ---

  useEffect(() => {
    const phase = loginModal?.phase;
    if (!loginModal || (phase !== "starting" && phase !== "completing")) return;
    // Only poll in "starting" (waiting for URL) and "completing" (waiting for process exit after submit)
    // Don't poll in "has-url" — user is typing the code

    const { profileName, email } = loginModal;

    const poll = async () => {
      try {
        const { stdout } = await sshExec(machine, `${PROXY} status`);
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) return;

        if (parsed.phase === "has-url" && phase === "starting") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setLoginModal({ profileName, email, phase: "has-url", url: parsed.url, code: "" });
        } else if (parsed.phase === "done") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // Save credentials for this profile
          const { exitCode } = await sshExec(
            machine,
            `bash ~/.vps/claude-profile.sh save '${profileName}' --force --json`,
          );
          if (exitCode === 0) {
            setLoginModal({ profileName, email, phase: "done", message: `Logged in as ${profileName}` });
            refresh();
          } else {
            setLoginModal({
              profileName,
              email,
              phase: "error",
              message: parsed.output?.trim() || "Login completed but failed to save credentials",
            });
          }
          // Cleanup
          await sshExec(machine, `${PROXY} cancel`).catch(() => {});
        }
      } catch {
        // Poll errors are non-fatal
      }
    };

    pollRef.current = setInterval(poll, 1500);
    poll();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [loginModal?.phase === "starting" || loginModal?.phase === "completing" ? loginModal.phase : null, machine, refresh]);

  // --- Login: submit auth code ---

  const handleLoginSubmit = useCallback(async () => {
    if (!loginModal || loginModal.phase !== "has-url") return;
    const code = loginModal.code.trim();
    if (!code) return;

    const { profileName, email } = loginModal;
    setLoginModal({ profileName, email, phase: "submitting" });

    try {
      const { stdout } = await sshExec(machine, `${PROXY} submit '${code}'`);
      const parsed = JSON.parse(stdout);
      if (!parsed.ok) {
        setLoginModal({ profileName, email, phase: "error", message: parsed.error || "Submit failed" });
        return;
      }
      // Move to completing phase — polling will pick up the result
      setLoginModal({ profileName, email, phase: "completing" });
    } catch {
      setLoginModal({ profileName, email, phase: "error", message: "Failed to submit code" });
    }
  }, [loginModal, machine]);

  // --- Login: cancel ---

  const handleLoginCancel = useCallback(async () => {
    await sshExec(machine, `${PROXY} cancel`).catch(() => {});
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setLoginModal(null);
    refresh();
  }, [machine, refresh]);

  // --- Input handling ---

  useInput((input, key) => {
    // Login modal input
    if (loginModal) {
      if (key.escape) {
        handleLoginCancel();
        return;
      }

      // Confirm phase: Enter to start
      if (key.return && loginModal.phase === "confirm") {
        handleLoginStart();
        return;
      }

      // Has-URL phase: text input for auth code
      if (loginModal.phase === "has-url") {
        if (key.return) {
          handleLoginSubmit();
          return;
        }
        if (key.backspace || key.delete) {
          setLoginModal((m) => (m?.phase === "has-url" ? { ...m, code: m.code.slice(0, -1) } : m));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setLoginModal((m) => (m?.phase === "has-url" ? { ...m, code: m.code + input } : m));
          return;
        }
        return;
      }

      // Done/error phase: Enter to dismiss
      if (key.return && (loginModal.phase === "done" || loginModal.phase === "error")) {
        setLoginModal(null);
        refresh();
        return;
      }
      return;
    }

    if (actionInProgress) return;

    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      moveCursor(-1);
      return;
    }
    if (key.downArrow || input === "j") {
      moveCursor(1);
      return;
    }

    if (key.return) {
      handleSwitch();
      return;
    }

    // l: open login modal for selected profile
    if (input === "l") {
      if (profiles.length > 0 && profiles[profileCursor]) {
        const p = profiles[profileCursor];
        setLoginModal({ profileName: p.name, email: p.email, phase: "confirm" });
      }
      return;
    }

    if (input === "n") {
      handleNext();
      return;
    }

    // s: save — only on active profile
    if (input === "s") {
      if (profiles.length === 0) return;
      const profile = profiles[profileCursor];
      if (!profile?.active) {
        showStatus("Can only save on the active profile");
        return;
      }
      handleRefreshToken();
      return;
    }

    if (input === "f") {
      refresh();
      showStatus("Refreshing...");
      return;
    }

    if (input === "r") {
      handleRefreshToken();
      return;
    }
  });

  // --- Render helpers ---

  const formatTokenStatus = (profile: { token_status: string; has_credentials: boolean }) => {
    if (!profile.has_credentials) {
      return { text: "(not saved)", color: theme.overlay0 };
    }
    if (profile.token_status.startsWith("valid")) {
      return { text: profile.token_status, color: theme.green };
    }
    if (profile.token_status === "expired" || profile.token_status.startsWith("expired")) {
      return { text: profile.token_status, color: theme.red };
    }
    return { text: profile.token_status, color: theme.overlay1 };
  };

  const columnWidth = Math.max(20, Math.floor((cols - 6) / 2));

  // --- Login modal render ---
  if (loginModal) {
    const modalWidth = Math.min(60, cols - 4);

    const borderColor =
      loginModal.phase === "error"
        ? theme.red
        : loginModal.phase === "done"
          ? theme.green
          : theme.accent;

    const footerHints = (() => {
      switch (loginModal.phase) {
        case "confirm":
          return (
            <>
              <Text color={theme.accent}>{"\u21B5"}</Text> start{" \u00b7 "}
              <Text color={theme.accent}>esc</Text> cancel
            </>
          );
        case "has-url":
          return (
            <>
              <Text color={theme.accent}>{"\u21B5"}</Text> submit code{" \u00b7 "}
              <Text color={theme.accent}>esc</Text> cancel
            </>
          );
        case "done":
        case "error":
          return (
            <>
              <Text color={theme.accent}>{"\u21B5"}</Text> done{" \u00b7 "}
              <Text color={theme.accent}>esc</Text> back
            </>
          );
        default:
          return (
            <>
              <Text color={theme.accent}>esc</Text> cancel
            </>
          );
      }
    })();

    return (
      <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
        <Box flexGrow={1} />
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.overlay0} dimColor>
            LOGIN
          </Text>
          <Text> </Text>
          <Box
            flexDirection="column"
            width={modalWidth}
            backgroundColor={theme.panelBg}
            borderStyle="round"
            borderColor={borderColor}
            paddingX={2}
            paddingY={1}
          >
            <Text bold color={theme.text}>
              {loginModal.profileName}
            </Text>
            {loginModal.email && <Text color={theme.subtext0}>{loginModal.email}</Text>}
            <Text> </Text>

            {loginModal.phase === "confirm" && (
              <>
                <Text color={theme.overlay1}>This will start OAuth login for this profile.</Text>
                <Text color={theme.overlay1}>
                  A URL will appear — copy it and open in your browser.
                </Text>
                <Text color={theme.overlay1}>Then paste the authorization code back here.</Text>
              </>
            )}

            {loginModal.phase === "starting" && <Spinner label="Starting login..." />}

            {loginModal.phase === "has-url" && (
              <>
                <Text color={theme.overlay1}>1. Open this URL in your browser:</Text>
                <Text> </Text>
                <Text color={theme.lavender} bold>
                  {loginModal.url}
                </Text>
                <Text> </Text>
                <Text color={theme.overlay1}>2. Paste the authorization code below:</Text>
                <Box marginTop={1}>
                  <Box
                    borderStyle="round"
                    borderColor={theme.accent}
                    paddingX={1}
                    width={modalWidth - 6}
                  >
                    <Text color={theme.text}>{loginModal.code}</Text>
                    <Text color={theme.accent}>{"\u258C"}</Text>
                  </Box>
                </Box>
              </>
            )}

            {loginModal.phase === "submitting" && <Spinner label="Submitting code..." />}

            {loginModal.phase === "completing" && <Spinner label="Completing login..." />}

            {loginModal.phase === "done" && <Text color={theme.green}>{loginModal.message}</Text>}

            {loginModal.phase === "error" && <Text color={theme.red}>{loginModal.message}</Text>}
          </Box>
        </Box>
        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color={theme.overlay0}>{footerHints}</Text>
        </Box>
      </Box>
    );
  }

  // --- Claude Code column content ---
  const renderClaudeCodeColumn = () => {
    if (loading) {
      return (
        <Box paddingX={2} paddingY={1}>
          <Spinner label="Loading profiles..." />
        </Box>
      );
    }

    if (profiles.length === 0) {
      return (
        <Box paddingX={2} paddingY={1}>
          <Text color={theme.overlay0}>No profiles configured</Text>
        </Box>
      );
    }

    const activeProfile = profiles.find((p) => p.active);
    const activeStatus = activeProfile ? formatTokenStatus(activeProfile) : null;
    const visibleProfiles = profiles.slice(scrollOffset, scrollOffset + maxVisible);
    const aboveCount = scrollOffset;
    const belowCount = Math.max(0, profiles.length - scrollOffset - maxVisible);

    return (
      <Box flexDirection="column" paddingX={1}>
        {activeProfile && (
          <Box paddingY={1} paddingX={1}>
            <Text color={theme.overlay1}>
              Active:{" "}
              <Text bold color={theme.text}>
                {activeProfile.name}
              </Text>
              {activeStatus && <Text color={activeStatus.color}> ({activeStatus.text})</Text>}
            </Text>
          </Box>
        )}

        {aboveCount > 0 && (
          <Box paddingX={1}>
            <Text color={theme.overlay1}>
              {" \u2191"} {aboveCount} more
            </Text>
          </Box>
        )}

        {visibleProfiles.map((profile, i) => {
          const globalIdx = scrollOffset + i;
          const isFocused = globalIdx === profileCursor;
          const tokenInfo = formatTokenStatus(profile);

          return (
            <Box key={profile.name} flexDirection="column" paddingX={1} paddingY={0}>
              <Box>
                <Text
                  color={isFocused ? theme.accent : theme.text}
                  backgroundColor={isFocused ? theme.highlight : undefined}
                >
                  {profile.active ? (
                    <Text color={theme.green}>{"\u25CF"}</Text>
                  ) : (
                    <Text color={theme.overlay0}>{"\u25CB"}</Text>
                  )}{" "}
                  <Text bold color={isFocused ? theme.accent : theme.text}>
                    {profile.name}
                  </Text>
                </Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={theme.subtext0}>{profile.email}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={tokenInfo.color}>{tokenInfo.text}</Text>
              </Box>
            </Box>
          );
        })}

        {belowCount > 0 && (
          <Box paddingX={1}>
            <Text color={theme.overlay1}>
              {" \u2193"} {belowCount} more
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  // --- Main render ---
  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box paddingX={2} paddingY={1} justifyContent="space-between">
        <Text bold color={theme.accent}>
          AGENT PROFILES
        </Text>
        <Text color={theme.overlay0}>
          <Text color={theme.overlay1}>esc</Text> back
          {" \u00b7 "}
          <Text color={theme.overlay1}>{"\u21B5"}</Text> switch
          {" \u00b7 "}
          <Text color={theme.overlay1}>l</Text> login
          {" \u00b7 "}
          <Text color={theme.overlay1}>n</Text> next
          {" \u00b7 "}
          <Text color={theme.overlay1}>r</Text> refresh token
          {" \u00b7 "}
          <Text color={theme.overlay1}>f</Text> refetch
        </Text>
      </Box>

      {statusMessage && (
        <Box paddingX={2}>
          <Text color={theme.yellow}>{statusMessage}</Text>
        </Box>
      )}

      <Box flexDirection="row" flexGrow={1} paddingX={1} gap={1}>
        <Box
          flexDirection="column"
          width={columnWidth}
          borderStyle="round"
          borderColor={theme.panelBorderFocused}
          backgroundColor={theme.panelBg}
        >
          <Box paddingX={1}>
            <Text bold color={theme.accent}>
              Claude Code
            </Text>
          </Box>
          {renderClaudeCodeColumn()}
        </Box>

        <Box
          flexDirection="column"
          width={columnWidth}
          borderStyle="round"
          borderColor={theme.panelBorder}
          backgroundColor={theme.panelBg}
        >
          <Box paddingX={1}>
            <Text bold color={theme.overlay0}>
              Codex (coming soon)
            </Text>
          </Box>
          <Box paddingX={2} paddingY={1} justifyContent="center" alignItems="center" flexGrow={1}>
            <Text color={theme.overlay0}>No profiles configured</Text>
          </Box>
        </Box>
      </Box>

      <Box paddingX={2} paddingBottom={1}>
        <Text color={theme.overlay0}>
          {actionInProgress ? (
            <Spinner label="Working..." />
          ) : profiles.length > 0 ? (
            <Text>
              {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
              {" \u00b7 "}
              {profiles.filter((p) => p.has_credentials).length} with saved credentials
            </Text>
          ) : loading ? (
            "Loading..."
          ) : (
            "No profiles found"
          )}
        </Text>
      </Box>
    </Box>
  );
}
