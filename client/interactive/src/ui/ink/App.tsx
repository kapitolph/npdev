import React, { useState, useCallback, useEffect } from "react";
import { Box, useInput } from "ink";
import type { Machine, VersionInfo } from "../../types";
import { useSessions } from "./hooks/useSessions";
import { useTerminalSize } from "./hooks/useTerminalSize";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SessionList } from "./components/SessionList";
import { TeamSection } from "./components/TeamSection";
import { ButtonBar } from "./components/ButtonBar";
import type { ButtonDef } from "./components/ButtonBar";
import { StatusLine } from "./components/StatusLine";
import { Spinner } from "./components/Spinner";
import { EmptyState } from "./components/EmptyState";
import { TextInput } from "./components/TextInput";

type AppState =
  | { mode: "dashboard" }
  | { mode: "new-session"; input: string; error: string }
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
  const { cols, rows, layout } = useTerminalSize();

  const [state, setState] = useState<AppState>({ mode: "dashboard" });
  const [activeTab, setActiveTab] = useState<"sessions" | "team">("sessions");
  const [cursor, setCursor] = useState(0);
  const [focusZone, setFocusZone] = useState<"list" | "buttons">("list");
  const [focusedButton, setFocusedButton] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Current list based on active tab
  const currentList = activeTab === "sessions" ? mine : team;
  const maxItems = currentList.length;

  // Viewport windowing
  const maxVisible = Math.max(3, rows - 8);

  // Move cursor and scroll offset together in one batch to avoid cascading renders
  const moveCursor = useCallback(
    (delta: number) => {
      setCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, maxItems - 1));
        // Update scroll offset in the same tick
        setScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + maxVisible) return next - maxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [maxItems, maxVisible]
  );

  // Clamp cursor when list size changes
  useEffect(() => {
    setCursor((c) => {
      const clamped = Math.min(c, Math.max(0, maxItems - 1));
      setScrollOffset((offset) => {
        if (clamped < offset) return clamped;
        if (clamped >= offset + maxVisible) return clamped - maxVisible + 1;
        return offset;
      });
      return clamped;
    });
  }, [maxItems, maxVisible]);

  // Default focus to buttons when list is empty
  useEffect(() => {
    if (maxItems === 0 && !loading) {
      setFocusZone("buttons");
    }
  }, [maxItems, loading]);

  const toggleTab = useCallback(() => {
    setActiveTab((t) => {
      const next = t === "sessions" ? "team" : "sessions";
      if (next === "team" && team.length === 0) return t;
      return next;
    });
    setCursor(0);
    setScrollOffset(0);
  }, [team.length]);

  // Button definitions
  const buttons: ButtonDef[] = [
    { key: "n", label: "New", action: () => setState({ mode: "new-session", input: "", error: "" }) },
    ...(team.length > 0
      ? [{ key: "t", label: activeTab === "team" ? "Sessions" : "Team", action: toggleTab }]
      : []),
    ...(stale.length > 0
      ? [{ key: "c", label: "Clean", action: () => setState({ mode: "confirm-stale" }) }]
      : []),
    { key: "m", label: "Manage", action: () => onAction({ type: "manage" }) },
    { key: "s", label: "Setup", action: () => onAction({ type: "setup" }) },
    { key: "u", label: "Update", action: () => onAction({ type: "update" }) },
    { key: "r", label: "Refresh", action: refresh },
    { key: "q", label: "Quit", action: () => onAction({ type: "exit" }) },
  ];

  // Clamp focused button when buttons change
  useEffect(() => {
    setFocusedButton((f) => Math.min(f, Math.max(0, buttons.length - 1)));
  }, [buttons.length]);

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

    // Tab key: toggle focus zone
    if (key.tab) {
      setFocusZone((z) => (z === "list" ? "buttons" : "list"));
      return;
    }

    // Navigation in list zone
    if (focusZone === "list") {
      if (input === "j" || key.downArrow) {
        moveCursor(1);
        return;
      }
      if (input === "k" || key.upArrow) {
        moveCursor(-1);
        return;
      }
      // Enter to select session
      if (key.return && maxItems > 0 && cursor < maxItems) {
        if (activeTab === "team") {
          onAction({ type: "join-team", sessionName: currentList[cursor].name });
        } else {
          onAction({ type: "resume", sessionName: currentList[cursor].name });
        }
        return;
      }
    }

    // Navigation in button zone
    if (focusZone === "buttons") {
      if (key.leftArrow) {
        setFocusedButton((f) => Math.max(0, f - 1));
        return;
      }
      if (key.rightArrow) {
        setFocusedButton((f) => Math.min(buttons.length - 1, f + 1));
        return;
      }
      if (key.return) {
        buttons[focusedButton]?.action();
        return;
      }
    }

    // Global shortcut keys (work in any focus zone)
    const shortcut = buttons.find((b) => b.key === input);
    if (shortcut) {
      shortcut.action();
      return;
    }

    if (key.escape) {
      onAction({ type: "exit" });
    }
  });

  const contentWidth = cols - 2;
  const isEmpty = mine.length === 0 && team.length === 0;

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" width={cols}>
        <Header
          machineName={machine.name}
          npdevUser={npdevUser}
          version={version}
          cols={cols}
          layout={layout}
        />
        <Box paddingX={1} paddingY={1}>
          <Spinner label="Loading sessions..." />
        </Box>
      </Box>
    );
  }

  // Session area based on layout
  const sessionArea = isEmpty ? (
    <EmptyState />
  ) : layout === "wide" ? (
    // Wide: side by side
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>
        {mine.length > 0 ? (
          <SessionList
            sessions={mine}
            selectedIndex={activeTab === "sessions" ? cursor : -1}
            selectable={activeTab === "sessions" && focusZone === "list"}
            layout={layout}
            width={Math.floor(contentWidth / 2) - 1}
            scrollOffset={activeTab === "sessions" ? scrollOffset : 0}
            maxVisible={maxVisible}
          />
        ) : (
          <EmptyState />
        )}
      </Box>
      {team.length > 0 && (
        <Box flexDirection="column" flexGrow={1}>
          <TeamSection
            sessions={team}
            selectedIndex={activeTab === "team" ? cursor : -1}
            selectable={activeTab === "team" && focusZone === "list"}
            layout={layout}
            width={Math.floor(contentWidth / 2) - 1}
            scrollOffset={activeTab === "team" ? scrollOffset : 0}
            maxVisible={maxVisible}
          />
        </Box>
      )}
    </Box>
  ) : (
    // Normal/narrow: tabbed
    <Box flexDirection="column">
      <TabBar
        activeTab={activeTab}
        sessionCount={mine.length}
        teamCount={team.length}
      />
      {activeTab === "sessions" ? (
        <SessionList
          sessions={mine}
          selectedIndex={focusZone === "list" ? cursor : -1}
          selectable={focusZone === "list"}
          layout={layout}
          width={contentWidth}
          scrollOffset={scrollOffset}
          maxVisible={maxVisible}
        />
      ) : (
        <TeamSection
          sessions={team}
          selectedIndex={focusZone === "list" ? cursor : -1}
          selectable={focusZone === "list"}
          layout={layout}
          width={contentWidth}
          scrollOffset={scrollOffset}
          maxVisible={maxVisible}
        />
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" width={cols}>
      <Header
        machineName={machine.name}
        npdevUser={npdevUser}
        version={version}
        cols={cols}
        layout={layout}
      />
      <Box flexDirection="column" flexGrow={1} gap={1} paddingX={1}>
        {sessionArea}
        {state.mode === "new-session" && (
          <TextInput
            label="Session name:"
            value={state.input}
            error={state.error || undefined}
            hint="Enter to confirm, Esc to cancel"
          />
        )}
      </Box>
      <StatusLine
        mode={state.mode}
        activeTab={activeTab}
        staleCount={stale.length}
        sessionCount={mine.length + team.length}
        confirmStale={state.mode === "confirm-stale"}
        cols={cols}
      />
      <ButtonBar
        buttons={buttons}
        focusedIndex={focusedButton}
        isFocusZone={focusZone === "buttons"}
      />
    </Box>
  );
}
