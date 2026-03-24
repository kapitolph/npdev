import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { sshExec } from "../../../lib/ssh";
import type { Machine } from "../../../types";
import type { AppAction } from "../App";
import { useTheme } from "../context/ThemeContext";
import type { CodexProfile } from "../hooks/useCodexProfiles";
import { useCodexProfiles } from "../hooks/useCodexProfiles";
import type { Profile } from "../hooks/useProfiles";
import { useProfiles } from "../hooks/useProfiles";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { Spinner } from "./Spinner";

type FocusColumn = "claude" | "codex";

interface Props {
  machine: Machine;
  onBack: () => void;
  onAction: (action: AppAction) => void;
}

export function ProfilesPage({ machine, onBack, onAction }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const { profiles, loading, refresh } = useProfiles(machine);
  const {
    profiles: codexProfiles,
    loading: codexLoading,
    refresh: codexRefresh,
  } = useCodexProfiles(machine);

  const [focusColumn, setFocusColumn] = useState<FocusColumn>("claude");
  const [profileCursor, setProfileCursor] = useState(0);
  const [codexCursor, setCodexCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [codexScrollOffset, setCodexScrollOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxVisible = Math.max(2, Math.floor((rows - 12) / 3));

  useEffect(() => {
    setProfileCursor((c) => Math.min(c, Math.max(0, profiles.length - 1)));
  }, [profiles.length]);

  useEffect(() => {
    setCodexCursor((c) => Math.min(c, Math.max(0, codexProfiles.length - 1)));
  }, [codexProfiles.length]);

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
    };
  }, []);

  const currentCursor = focusColumn === "claude" ? profileCursor : codexCursor;
  const currentList = focusColumn === "claude" ? profiles : codexProfiles;
  const setCurrentCursor = focusColumn === "claude" ? setProfileCursor : setCodexCursor;
  const currentScrollOffset = focusColumn === "claude" ? scrollOffset : codexScrollOffset;
  const setCurrentScrollOffset = focusColumn === "claude" ? setScrollOffset : setCodexScrollOffset;

  const moveCursor = useCallback(
    (delta: number) => {
      setCurrentCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, currentList.length - 1));
        setCurrentScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + maxVisible) return next - maxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [currentList.length, maxVisible, setCurrentCursor, setCurrentScrollOffset],
  );

  // --- Action handlers ---

  const handleSwitch = useCallback(async () => {
    if (currentList.length === 0 || actionInProgress) return;
    const profile = currentList[currentCursor];
    if (!profile || !profile.has_credentials) {
      showStatus("No saved credentials \u2014 press l to login first");
      return;
    }
    const script = focusColumn === "claude" ? "claude-profile.sh" : "codex-profile.sh";
    setActionInProgress(true);
    try {
      await sshExec(machine, `bash ~/.vps/${script} use '${profile.name}' --json`);
      showStatus(`Switched to ${profile.name}`);
      focusColumn === "claude" ? refresh() : codexRefresh();
    } catch {
      showStatus("Switch failed");
    }
    setActionInProgress(false);
  }, [currentList, currentCursor, focusColumn, machine, refresh, codexRefresh, showStatus, actionInProgress]);

  const handleNext = useCallback(async () => {
    if (currentList.length === 0 || actionInProgress) return;
    const script = focusColumn === "claude" ? "claude-profile.sh" : "codex-profile.sh";
    setActionInProgress(true);
    try {
      const { stdout } = await sshExec(machine, `bash ~/.vps/${script} next --json`);
      const parsed = JSON.parse(stdout);
      const nextName = parsed?.profile || "next profile";
      showStatus(`Switched to ${nextName}`);
      focusColumn === "claude" ? refresh() : codexRefresh();
    } catch {
      showStatus("Cycle failed");
    }
    setActionInProgress(false);
  }, [currentList.length, focusColumn, machine, refresh, codexRefresh, showStatus, actionInProgress]);

  const handleRefreshToken = useCallback(async () => {
    if (actionInProgress) return;
    if (focusColumn === "codex") {
      showStatus("Codex manages token refresh internally");
      return;
    }
    const active = profiles.find((p) => p.active);
    if (!active) {
      showStatus("No active profile to refresh");
      return;
    }
    setActionInProgress(true);
    try {
      const { stdout } = await sshExec(
        machine,
        `bash ~/.vps/claude-profile.sh refresh '${active.name}' --json`,
      );
      const parsed = JSON.parse(stdout);
      showStatus(
        parsed.ok
          ? `Refreshed token for ${active.name} — ${parsed.token_status}`
          : `Refresh failed: ${parsed.error || "unknown error"}`,
      );
      refresh();
    } catch {
      showStatus("Token refresh failed");
    }
    setActionInProgress(false);
  }, [focusColumn, profiles, machine, refresh, showStatus, actionInProgress]);

  // --- Input handling ---

  useInput((input, key) => {
    if (actionInProgress) return;

    if (key.escape) {
      onBack();
      return;
    }

    // Left/Right: switch columns
    if (key.leftArrow && focusColumn === "codex") {
      setFocusColumn("claude");
      return;
    }
    if (key.rightArrow && focusColumn === "claude") {
      setFocusColumn("codex");
      return;
    }
    if (key.tab) {
      setFocusColumn((prev) => (prev === "claude" ? "codex" : "claude"));
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

    // l: login via interactive TTY
    if (input === "l") {
      if (currentList.length > 0 && currentList[currentCursor]) {
        const p = currentList[currentCursor];
        if (focusColumn === "claude") {
          onAction({ type: "ccp-login", profileName: p.name });
        } else {
          onAction({ type: "cxp-login", profileName: p.name });
        }
      }
      return;
    }

    if (input === "n") {
      handleNext();
      return;
    }

    // s: save — only on active profile
    if (input === "s") {
      if (currentList.length === 0) return;
      const profile = currentList[currentCursor];
      if (!profile?.active) {
        showStatus("Can only save on the active profile");
        return;
      }
      if (focusColumn === "claude") {
        handleRefreshToken();
      } else {
        showStatus("Codex manages token refresh internally");
      }
      return;
    }

    if (input === "f") {
      refresh();
      codexRefresh();
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
    if (profile.token_status === "stale") {
      return { text: "stale (>8d)", color: theme.yellow };
    }
    return { text: profile.token_status, color: theme.overlay1 };
  };

  const columnWidth = Math.max(20, Math.floor((cols - 6) / 2));

  const renderProfileList = (
    profileList: (Profile | CodexProfile)[],
    isLoading: boolean,
    isFocused: boolean,
    cursor: number,
    offset: number,
    extraLine?: (p: Profile | CodexProfile) => string | null,
  ) => {
    if (isLoading) {
      return (
        <Box paddingX={2} paddingY={1}>
          <Spinner label="Loading profiles..." />
        </Box>
      );
    }

    if (profileList.length === 0) {
      return (
        <Box paddingX={2} paddingY={1}>
          <Text color={theme.overlay0}>No profiles configured</Text>
        </Box>
      );
    }

    const activeProfile = profileList.find((p) => p.active);
    const activeStatus = activeProfile ? formatTokenStatus(activeProfile) : null;
    const visibleProfiles = profileList.slice(offset, offset + maxVisible);
    const aboveCount = offset;
    const belowCount = Math.max(0, profileList.length - offset - maxVisible);

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
          const globalIdx = offset + i;
          const isItemFocused = isFocused && globalIdx === cursor;
          const tokenInfo = formatTokenStatus(profile);
          const extra = extraLine?.(profile);

          return (
            <Box key={profile.name} flexDirection="column" paddingX={1} paddingY={0}>
              <Box>
                <Text
                  color={isItemFocused ? theme.accent : theme.text}
                  backgroundColor={isItemFocused ? theme.highlight : undefined}
                >
                  {profile.active ? (
                    <Text color={theme.green}>{"\u25CF"}</Text>
                  ) : (
                    <Text color={theme.overlay0}>{"\u25CB"}</Text>
                  )}{" "}
                  <Text bold color={isItemFocused ? theme.accent : theme.text}>
                    {profile.name}
                  </Text>
                </Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={theme.subtext0}>{profile.email}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={tokenInfo.color}>{tokenInfo.text}</Text>
                {extra && (
                  <Text color={theme.overlay1}> {extra}</Text>
                )}
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

  const totalProfiles = profiles.length + codexProfiles.length;
  const totalCreds =
    profiles.filter((p) => p.has_credentials).length +
    codexProfiles.filter((p) => p.has_credentials).length;

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
          <Text color={theme.overlay1}>r</Text> refresh
          {" \u00b7 "}
          <Text color={theme.overlay1}>n</Text> next
          {" \u00b7 "}
          <Text color={theme.overlay1}>tab</Text> column
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
          borderColor={focusColumn === "claude" ? theme.panelBorderFocused : theme.panelBorder}
          backgroundColor={theme.panelBg}
        >
          <Box paddingX={1}>
            <Text bold color={focusColumn === "claude" ? theme.accent : theme.overlay0}>
              Claude Code
            </Text>
          </Box>
          {renderProfileList(
            profiles,
            loading,
            focusColumn === "claude",
            profileCursor,
            scrollOffset,
          )}
        </Box>

        <Box
          flexDirection="column"
          width={columnWidth}
          borderStyle="round"
          borderColor={focusColumn === "codex" ? theme.panelBorderFocused : theme.panelBorder}
          backgroundColor={theme.panelBg}
        >
          <Box paddingX={1}>
            <Text bold color={focusColumn === "codex" ? theme.accent : theme.overlay0}>
              Codex CLI
            </Text>
          </Box>
          {renderProfileList(
            codexProfiles,
            codexLoading,
            focusColumn === "codex",
            codexCursor,
            codexScrollOffset,
            (p) => {
              const cp = p as CodexProfile;
              return cp.plan_type && cp.plan_type !== "-" && cp.plan_type !== ""
                ? cp.plan_type
                : null;
            },
          )}
        </Box>
      </Box>

      <Box paddingX={2} paddingBottom={1}>
        <Text color={theme.overlay0}>
          {actionInProgress ? (
            <Spinner label="Working..." />
          ) : totalProfiles > 0 ? (
            <Text>
              {totalProfiles} profile{totalProfiles !== 1 ? "s" : ""}
              {" \u00b7 "}
              {totalCreds} with saved credentials
            </Text>
          ) : loading || codexLoading ? (
            "Loading..."
          ) : (
            "No profiles found"
          )}
        </Text>
      </Box>
    </Box>
  );
}
