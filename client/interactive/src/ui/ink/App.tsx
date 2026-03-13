import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { sshExec } from "../../lib/ssh";
import type { Machine, VersionInfo } from "../../types";
import type { ButtonDef } from "./components/ButtonBar";
import { ButtonBar } from "./components/ButtonBar";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SessionList } from "./components/SessionList";
import { Spinner } from "./components/Spinner";
import { StatusLine } from "./components/StatusLine";
import { TabBar } from "./components/TabBar";
import { TeamSection } from "./components/TeamSection";
import { TextInput } from "./components/TextInput";
import { useTheme } from "./context/ThemeContext";
import { useSessions } from "./hooks/useSessions";
import { useTerminalSize } from "./hooks/useTerminalSize";

type AppState =
  | { mode: "dashboard" }
  | { mode: "new-session"; input: string; error: string }
  | { mode: "confirm-stale" }
  | { mode: "confirm-end"; sessionName: string };

export type AppAction =
  | { type: "resume"; sessionName: string }
  | { type: "new-session"; sessionName: string }
  | { type: "join-team"; sessionName: string }
  | { type: "setup" }
  | { type: "update" }
  | { type: "exit" };

interface Props {
  machine: Machine;
  npdevUser: string;
  version: VersionInfo;
  isOnVPS: boolean;
  onAction: (action: AppAction) => void;
}

export function App({ machine, npdevUser, version, isOnVPS, onAction }: Props) {
  const { mine, team, stale, loading, refresh } = useSessions(machine, npdevUser);
  const { cols, rows, layout } = useTerminalSize();
  const theme = useTheme();

  const [state, setState] = useState<AppState>({ mode: "dashboard" });
  const [activePanel, setActivePanel] = useState<"mine" | "team">("mine");
  const [cursorArea, setCursorArea] = useState<"actions" | "sessions">("sessions");
  const [cursor, setCursor] = useState(0);
  const [focusedButton, setFocusedButton] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Current list based on active panel
  const currentList = activePanel === "mine" ? mine : team;
  const maxItems = currentList.length;

  // Button count estimate for viewport calculation (must match actual buttons below)
  const buttonCount = 3 + (stale.length > 0 ? 1 : 0) + (!isOnVPS ? 2 : 0);
  const buttonLines = buttonCount * 3;
  const maxVisible = Math.max(3, rows - 12 - buttonLines);

  // Move cursor and scroll offset together in one batch
  const moveCursor = useCallback(
    (delta: number) => {
      setCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, maxItems - 1));
        setScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + maxVisible) return next - maxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [maxItems, maxVisible],
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

  // Default cursor to actions when list is empty
  useEffect(() => {
    if (maxItems === 0 && !loading) {
      setCursorArea("actions");
    }
  }, [maxItems, loading]);

  const switchPanel = useCallback(() => {
    setActivePanel((p) => {
      const next = p === "mine" ? "team" : "mine";
      if (next === "team" && team.length === 0) return p;
      return next;
    });
    setCursor(0);
    setScrollOffset(0);
  }, [team.length]);

  const endSession = useCallback(
    async (name: string) => {
      await sshExec(machine, `bash ~/.vps/session.sh end '${name}'`);
      refresh();
    },
    [machine, refresh],
  );

  // Button definitions
  const buttons: ButtonDef[] = [
    {
      key: "n",
      label: "New",
      action: () => setState({ mode: "new-session", input: "", error: "" }),
    },
    ...(stale.length > 0
      ? [
          {
            key: "c",
            label: `Clean ${stale.length}`,
            action: () => setState({ mode: "confirm-stale" }),
          },
        ]
      : []),
    { key: "r", label: "Refresh", action: refresh },
    ...(!isOnVPS
      ? [
          { key: "s", label: "Setup", action: () => onAction({ type: "setup" }) },
          { key: "u", label: "Update", action: () => onAction({ type: "update" }) },
        ]
      : []),
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
        setState({ mode: "dashboard" });
        Promise.all(stale.map((s) => endSession(s.name))).catch(() => {});
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setState({ mode: "dashboard" });
      }
      return;
    }

    // Confirm end single session
    if (state.mode === "confirm-end") {
      if (input === "y" || input === "Y") {
        const name = state.sessionName;
        setState({ mode: "dashboard" });
        endSession(name);
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setState({ mode: "dashboard" });
      }
      return;
    }

    // Escape in dashboard → exit
    if (key.escape) {
      onAction({ type: "exit" });
      return;
    }

    // Navigation in actions row
    if (cursorArea === "actions") {
      if (key.upArrow || input === "k") {
        setFocusedButton((f) => Math.max(0, f - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        if (focusedButton < buttons.length - 1) {
          setFocusedButton((f) => f + 1);
        } else if (maxItems > 0) {
          setCursorArea("sessions");
        }
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        return; // no-op in vertical button list
      }
      if (key.return) {
        buttons[focusedButton]?.action();
        return;
      }
    }

    // Navigation in session list
    if (cursorArea === "sessions") {
      if (key.downArrow || input === "j") {
        moveCursor(1);
        return;
      }
      if (key.upArrow || input === "k") {
        if (cursor === 0) {
          setCursorArea("actions");
          setFocusedButton(buttons.length - 1);
        } else {
          moveCursor(-1);
        }
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        switchPanel();
        return;
      }
      // Enter to select session
      if (key.return && maxItems > 0 && cursor < maxItems) {
        if (activePanel === "team") {
          onAction({ type: "join-team", sessionName: currentList[cursor].name });
        } else {
          onAction({ type: "resume", sessionName: currentList[cursor].name });
        }
        return;
      }
      // d to end session
      if (input === "d" && maxItems > 0 && cursor < maxItems) {
        setState({ mode: "confirm-end", sessionName: currentList[cursor].name });
        return;
      }
    }

    // Global shortcut keys (work in any cursor area)
    // t for quick panel toggle
    if (input === "t") {
      switchPanel();
      return;
    }
    const shortcut = buttons.find((b) => b.key === input);
    if (shortcut) {
      shortcut.action();
      return;
    }
  });

  const contentWidth = cols - 4; // account for padding
  const isEmpty = mine.length === 0 && team.length === 0;

  // Derive activeTab for TabBar
  const activeTab = activePanel === "mine" ? ("sessions" as const) : ("team" as const);

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
        <Header
          machineName={machine.name}
          npdevUser={npdevUser}
          version={version}
          cols={cols}
          layout={layout}
          isOnVPS={isOnVPS}
        />
        <Box paddingX={2} paddingY={1}>
          <Spinner label="Loading sessions..." />
        </Box>
      </Box>
    );
  }

  // Session area based on layout
  const panelFocusedMine = cursorArea === "sessions" && activePanel === "mine";
  const panelFocusedTeam = cursorArea === "sessions" && activePanel === "team";

  const sessionPanels = isEmpty ? (
    <Box flexGrow={1} paddingY={1}>
      <EmptyState />
    </Box>
  ) : layout === "wide" ? (
    // Wide: side by side
    <Box flexDirection="row" gap={2} flexGrow={1}>
      {mine.length > 0 ? (
        <SessionList
          sessions={mine}
          selectedIndex={activePanel === "mine" ? cursor : -1}
          selectable={panelFocusedMine}
          focused={panelFocusedMine}
          layout={layout}
          width={Math.floor(contentWidth / 2) - 2}
          scrollOffset={activePanel === "mine" ? scrollOffset : 0}
          maxVisible={maxVisible}
        />
      ) : (
        <Box flexGrow={1} paddingY={1}>
          <EmptyState />
        </Box>
      )}
      {team.length > 0 && (
        <TeamSection
          sessions={team}
          selectedIndex={activePanel === "team" ? cursor : -1}
          selectable={panelFocusedTeam}
          focused={panelFocusedTeam}
          layout={layout}
          width={Math.floor(contentWidth / 2) - 2}
          scrollOffset={activePanel === "team" ? scrollOffset : 0}
          maxVisible={maxVisible}
        />
      )}
    </Box>
  ) : (
    // Normal/narrow: tabbed
    <Box flexDirection="column" flexGrow={1}>
      <TabBar activeTab={activeTab} sessionCount={mine.length} teamCount={team.length} />
      {activePanel === "mine" ? (
        <SessionList
          sessions={mine}
          selectedIndex={cursorArea === "sessions" ? cursor : -1}
          selectable={cursorArea === "sessions"}
          focused={panelFocusedMine}
          layout={layout}
          width={contentWidth}
          scrollOffset={scrollOffset}
          maxVisible={maxVisible}
        />
      ) : (
        <TeamSection
          sessions={team}
          selectedIndex={cursorArea === "sessions" ? cursor : -1}
          selectable={cursorArea === "sessions"}
          focused={panelFocusedTeam}
          layout={layout}
          width={contentWidth}
          scrollOffset={scrollOffset}
          maxVisible={maxVisible}
        />
      )}
    </Box>
  );

  const confirmEndName = state.mode === "confirm-end" ? state.sessionName : undefined;

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Header
        machineName={machine.name}
        npdevUser={npdevUser}
        version={version}
        cols={cols}
        layout={layout}
        isOnVPS={isOnVPS}
      />
      <Box paddingX={1}>
        <ButtonBar
          buttons={buttons}
          focusedIndex={focusedButton}
          isFocusZone={cursorArea === "actions"}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {sessionPanels}
        {state.mode === "new-session" && (
          <Box paddingY={1}>
            <TextInput
              label="Session name:"
              value={state.input}
              error={state.error || undefined}
              hint="Enter to confirm, Esc to cancel"
            />
          </Box>
        )}
      </Box>
      <StatusLine
        mode={state.mode}
        activePanel={activePanel}
        staleCount={stale.length}
        sessionCount={mine.length + team.length}
        confirmStale={state.mode === "confirm-stale"}
        confirmEndName={confirmEndName}
        cols={cols}
      />
    </Box>
  );
}
