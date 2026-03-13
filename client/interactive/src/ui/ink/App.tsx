import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { sshExec } from "../../lib/ssh";
import type { Machine, VersionInfo } from "../../types";
import type { ButtonDef } from "./components/ButtonBar";
import { ButtonBar } from "./components/ButtonBar";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { NewSessionPage } from "./components/NewSessionPage";
import { SessionList } from "./components/SessionList";
import { SetupPage } from "./components/SetupPage";
import { Spinner } from "./components/Spinner";
import { StatusLine } from "./components/StatusLine";
import { TabBar } from "./components/TabBar";
import { TeamSection } from "./components/TeamSection";
import { UpdatePage } from "./components/UpdatePage";
import { useTheme } from "./context/ThemeContext";
import { useSessions } from "./hooks/useSessions";
import { useTerminalSize } from "./hooks/useTerminalSize";

type Route =
  | { page: "dashboard" }
  | { page: "new-session" }
  | { page: "update" }
  | { page: "setup" };

type DashboardMode =
  | { mode: "normal" }
  | { mode: "confirm-stale" }
  | { mode: "confirm-end"; sessionName: string };

export type AppAction =
  | { type: "resume"; sessionName: string }
  | { type: "new-session"; sessionName: string }
  | { type: "join-team"; sessionName: string }
  | { type: "update-done" }
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

  const [route, setRoute] = useState<Route>({ page: "dashboard" });
  const [dashMode, setDashMode] = useState<DashboardMode>({ mode: "normal" });
  const [activePanel, setActivePanel] = useState<"mine" | "team">("mine");
  const [cursorArea, setCursorArea] = useState<"actions" | "sessions">("actions");
  const [cursor, setCursor] = useState(0);
  const [focusedButton, setFocusedButton] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Current list based on active panel
  const currentList = activePanel === "mine" ? mine : team;
  const maxItems = currentList.length;

  // Buttons are horizontal — 1 line each (3 with border top/bottom)
  const maxVisible = Math.max(3, rows - 14);

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
      action: () => setRoute({ page: "new-session" }),
    },
    ...(stale.length > 0
      ? [
          {
            key: "c",
            label: `Clean ${stale.length}`,
            action: () => setDashMode({ mode: "confirm-stale" }),
          },
        ]
      : []),
    { key: "r", label: "Refresh", action: refresh },
    ...(!isOnVPS
      ? [
          { key: "s", label: "Setup", action: () => setRoute({ page: "setup" }) },
          {
            key: "u",
            label: "Update",
            action: () => setRoute({ page: "update" }),
          },
        ]
      : []),
    { key: "q", label: "Quit", action: () => onAction({ type: "exit" }) },
  ];

  // Clamp focused button when buttons change
  useEffect(() => {
    setFocusedButton((f) => Math.min(f, Math.max(0, buttons.length - 1)));
  }, [buttons.length]);

  useInput((input, key) => {
    // Only handle input on dashboard page
    if (route.page !== "dashboard") return;
    if (loading) return;

    // Confirm stale cleanup
    if (dashMode.mode === "confirm-stale") {
      if (input === "y" || input === "Y") {
        setDashMode({ mode: "normal" });
        Promise.all(stale.map((s) => endSession(s.name))).catch(() => {});
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setDashMode({ mode: "normal" });
      }
      return;
    }

    // Confirm end single session
    if (dashMode.mode === "confirm-end") {
      if (input === "y" || input === "Y") {
        const name = dashMode.sessionName;
        setDashMode({ mode: "normal" });
        endSession(name);
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setDashMode({ mode: "normal" });
      }
      return;
    }

    // Escape in dashboard → exit
    if (key.escape) {
      onAction({ type: "exit" });
      return;
    }

    // Navigation in actions row (horizontal)
    if (cursorArea === "actions") {
      if (key.leftArrow) {
        setFocusedButton((f) => Math.max(0, f - 1));
        return;
      }
      if (key.rightArrow) {
        setFocusedButton((f) => Math.min(buttons.length - 1, f + 1));
        return;
      }
      if (key.downArrow || input === "j") {
        if (maxItems > 0) {
          setCursorArea("sessions");
        }
        return;
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
        setDashMode({ mode: "confirm-end", sessionName: currentList[cursor].name });
        return;
      }
    }

    // Global shortcut keys (work in any cursor area)
    if (input === "t") {
      switchPanel();
      return;
    }
    const shortcut = buttons.find((b) => b.key === input);
    if (shortcut) {
      shortcut.action();
    }
  });

  // --- Route: New Session ---
  if (route.page === "new-session") {
    return (
      <NewSessionPage
        onSubmit={(name) => onAction({ type: "new-session", sessionName: name })}
        onBack={() => setRoute({ page: "dashboard" })}
      />
    );
  }

  // --- Route: Update ---
  if (route.page === "update") {
    return <UpdatePage onDone={() => onAction({ type: "update-done" })} />;
  }

  // --- Route: Setup ---
  if (route.page === "setup") {
    return (
      <SetupPage
        machine={machine}
        onDone={() => setRoute({ page: "dashboard" })}
        onBack={() => setRoute({ page: "dashboard" })}
      />
    );
  }

  // --- Route: Dashboard ---
  const contentWidth = cols - 4;
  const isEmpty = mine.length === 0 && team.length === 0;
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

  const panelFocusedMine = cursorArea === "sessions" && activePanel === "mine";
  const panelFocusedTeam = cursorArea === "sessions" && activePanel === "team";

  const sessionPanels = isEmpty ? (
    <Box flexGrow={1} paddingY={1}>
      <EmptyState />
    </Box>
  ) : layout === "wide" ? (
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

  const confirmEndName = dashMode.mode === "confirm-end" ? dashMode.sessionName : undefined;

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
      <Box paddingX={1} paddingBottom={1}>
        <ButtonBar
          buttons={buttons}
          focusedIndex={focusedButton}
          isFocusZone={cursorArea === "actions"}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {sessionPanels}
      </Box>
      <StatusLine
        mode={
          dashMode.mode === "confirm-stale"
            ? "confirm-stale"
            : dashMode.mode === "confirm-end"
              ? "confirm-end"
              : "dashboard"
        }
        activePanel={activePanel}
        staleCount={stale.length}
        sessionCount={mine.length + team.length}
        confirmStale={dashMode.mode === "confirm-stale"}
        confirmEndName={confirmEndName}
        cols={cols}
      />
    </Box>
  );
}
