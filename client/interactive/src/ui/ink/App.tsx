import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { Machine, VersionInfo } from "../../types";
import { useSessions } from "./hooks/useSessions";
import { Header } from "./components/Header";
import { SessionList } from "./components/SessionList";
import { TeamSection } from "./components/TeamSection";
import { ActionBar } from "./components/ActionBar";
import { StaleNudge } from "./components/StaleNudge";
import { theme } from "./theme";

type AppState =
  | { mode: "dashboard" }
  | { mode: "new-session"; input: string; error: string }
  | { mode: "join-team" }
  | { mode: "confirm-stale" };

export type AppAction =
  | { type: "resume"; sessionName: string }
  | { type: "new-session"; sessionName: string }
  | { type: "join-team"; sessionName: string }
  | { type: "manage" }
  | { type: "setup" }
  | { type: "update" }
  | { type: "exit" };

interface Props {
  machine: Machine;
  npdevUser: string;
  version: VersionInfo;
  onAction: (action: AppAction) => void;
}

export function App({ machine, npdevUser, version, onAction }: Props) {
  const { mine, team, stale, loading, refresh } = useSessions(machine, npdevUser);
  const [state, setState] = useState<AppState>({ mode: "dashboard" });
  const [cursor, setCursor] = useState(0);

  // Clamp cursor when list size changes (e.g. after refresh)
  const maxItems = state.mode === "join-team" ? team.length : mine.length;
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, maxItems - 1)));
  }, [maxItems]);

  const clampCursor = useCallback(
    (n: number) => Math.max(0, Math.min(n, maxItems - 1)),
    [maxItems]
  );

  useInput((input, key) => {
    if (loading) return;

    // New session text input mode
    if (state.mode === "new-session") {
      if (key.escape) {
        setState({ mode: "dashboard" });
        return;
      }
      if (key.return) {
        const name = state.input.trim();
        if (!name) {
          setState({ ...state, error: "Name required" });
          return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          setState({ ...state, error: "Only letters, numbers, hyphens, underscores" });
          return;
        }
        onAction({ type: "new-session", sessionName: name });
        return;
      }
      if (key.backspace || key.delete) {
        setState({ ...state, input: state.input.slice(0, -1), error: "" });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState({ ...state, input: state.input + input, error: "" });
      }
      return;
    }

    // Confirm stale cleanup
    if (state.mode === "confirm-stale") {
      if (input === "y" || input === "Y") {
        onAction({ type: "manage" });
        return;
      }
      setState({ mode: "dashboard" });
      return;
    }

    // Navigation
    if (input === "j" || key.downArrow) {
      setCursor((c) => clampCursor(c + 1));
      return;
    }
    if (input === "k" || key.upArrow) {
      setCursor((c) => clampCursor(c - 1));
      return;
    }

    // Enter to select
    if (key.return) {
      if (state.mode === "join-team" && team.length > 0 && cursor < team.length) {
        onAction({ type: "join-team", sessionName: team[cursor].name });
        return;
      }
      if (state.mode === "dashboard" && mine.length > 0 && cursor < mine.length) {
        onAction({ type: "resume", sessionName: mine[cursor].name });
        return;
      }
    }

    // Action shortcuts
    if (state.mode === "dashboard" || state.mode === "join-team") {
      switch (input) {
        case "n":
          setState({ mode: "new-session", input: "", error: "" });
          setCursor(0);
          return;
        case "t":
          if (team.length > 0) {
            setState({ mode: "join-team" });
            setCursor(0);
          }
          return;
        case "c":
          if (stale.length > 0) {
            setState({ mode: "confirm-stale" });
          }
          return;
        case "m":
          onAction({ type: "manage" });
          return;
        case "s":
          onAction({ type: "setup" });
          return;
        case "u":
          onAction({ type: "update" });
          return;
        case "r":
          refresh();
          return;
        case "q":
          onAction({ type: "exit" });
          return;
      }
      if (key.escape) {
        if (state.mode === "join-team") {
          setState({ mode: "dashboard" });
          setCursor(0);
          return;
        }
        onAction({ type: "exit" });
        return;
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header machineName={machine.name} npdevUser={npdevUser} version={version} />
        <Box paddingX={1}>
          <Text color={theme.overlay1}>Loading sessions...</Text>
        </Box>
      </Box>
    );
  }

  const isJoining = state.mode === "join-team";

  // Build action bar
  const actions = [
    ...(mine.length > 0 && !isJoining ? [{ key: "↵", label: "Resume" }] : []),
    { key: "n", label: "New" },
    ...(team.length > 0 ? [{ key: "t", label: isJoining ? "Back (esc)" : "Team" }] : []),
    ...(stale.length > 0 ? [{ key: "c", label: "Clean stale" }] : []),
    { key: "m", label: "Manage" },
    { key: "s", label: "Setup" },
    { key: "u", label: "Update" },
    { key: "r", label: "Refresh" },
    { key: "q", label: "Quit" },
  ];

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Header machineName={machine.name} npdevUser={npdevUser} version={version} />

      {mine.length === 0 && team.length === 0 && (
        <Box paddingX={1}>
          <Text color={theme.overlay1}>No active sessions. Press </Text>
          <Text color={theme.mauve} bold>n</Text>
          <Text color={theme.overlay1}> to create one.</Text>
        </Box>
      )}

      <SessionList
        title="Your sessions"
        sessions={mine}
        selectedIndex={!isJoining ? cursor : -1}
        selectable={!isJoining && state.mode === "dashboard"}
      />

      <TeamSection
        sessions={team}
        selectedIndex={isJoining ? cursor : -1}
        selectable={isJoining}
      />

      {stale.length > 0 && state.mode !== "confirm-stale" && (
        <StaleNudge sessions={stale} />
      )}

      {state.mode === "confirm-stale" && (
        <Box paddingX={1} gap={1}>
          <Text color={theme.yellow}>
            End {stale.length} stale session{stale.length > 1 ? "s" : ""}?
          </Text>
          <Text color={theme.mauve} bold>[y]</Text>
          <Text color={theme.subtext0}> yes </Text>
          <Text color={theme.mauve} bold>[n]</Text>
          <Text color={theme.subtext0}> no</Text>
        </Box>
      )}

      {state.mode === "new-session" && (
        <Box flexDirection="column" paddingX={1}>
          <Box gap={1}>
            <Text color={theme.accent}>Session name:</Text>
            <Text color={theme.text}>{state.input}</Text>
            <Text color={theme.overlay0}>▌</Text>
          </Box>
          {state.error && (
            <Text color={theme.red}>  {state.error}</Text>
          )}
          <Text color={theme.overlay1} dimColor>
            Enter to confirm, Esc to cancel
          </Text>
        </Box>
      )}

      <ActionBar actions={actions} />
    </Box>
  );
}
