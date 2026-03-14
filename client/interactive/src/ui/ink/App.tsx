import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { saveConfigField } from "../../lib/config";
import { isMoshInstalled } from "../../lib/mosh";
import { deriveRepoName } from "../../lib/sessions";
import { sshExec } from "../../lib/ssh";
import type { Machine, RepoData, VersionInfo } from "../../types";
import type { ButtonDef } from "./components/ButtonBar";
import { ButtonBar } from "./components/ButtonBar";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { MoshInstallPage } from "./components/MoshInstallPage";
import { NewSessionPage } from "./components/NewSessionPage";
import { RepoDetailPage } from "./components/RepoDetailPage";
import { RepoList } from "./components/RepoList";
import { SessionList } from "./components/SessionList";
import { SetupPage } from "./components/SetupPage";
import { SkeletonLoader } from "./components/SkeletonLoader";
import { StaleNudge } from "./components/StaleNudge";
import { StatusLine } from "./components/StatusLine";
import { TabBar } from "./components/TabBar";
import { TeamSection } from "./components/TeamSection";
import { UpdatePage } from "./components/UpdatePage";
import { useTheme } from "./context/ThemeContext";
import { useRepos } from "./hooks/useRepos";
import { useSessions } from "./hooks/useSessions";
import { useTerminalSize } from "./hooks/useTerminalSize";

type Route =
  | { page: "dashboard" }
  | { page: "new-session" }
  | { page: "new-session-in-repo"; repoPath: string; repoName: string }
  | { page: "repo-detail"; repoPath: string; repoName: string }
  | { page: "update" }
  | { page: "setup" }
  | { page: "mosh-install" };

type DashboardMode =
  | { mode: "normal" }
  | { mode: "confirm-end"; sessionName: string }
  | { mode: "confirm-bulk"; sessionNames: string[] };

export type AppAction =
  | { type: "resume"; sessionName: string }
  | { type: "new-session"; sessionName: string }
  | { type: "new-session-in-repo"; sessionName: string; repoPath: string }
  | { type: "cd-to-repo"; repoPath: string }
  | { type: "join-team"; sessionName: string }
  | { type: "update-done" }
  | { type: "exit" };

type FocusColumn = "sessions" | "repos" | "team";

interface Props {
  machine: Machine;
  npdevUser: string;
  version: VersionInfo;
  isOnVPS: boolean;
  initialMoshEnabled: boolean;
  onAction: (action: AppAction) => void;
}

export function App({ machine, npdevUser, version, isOnVPS, initialMoshEnabled, onAction }: Props) {
  const { sessions, mine, team, stale, loading, refresh } = useSessions(machine, npdevUser);
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos(machine);
  const { cols, rows, layout } = useTerminalSize();
  const theme = useTheme();

  const [route, setRoute] = useState<Route>({ page: "dashboard" });
  const [dashMode, setDashMode] = useState<DashboardMode>({ mode: "normal" });
  const [focusColumn, setFocusColumn] = useState<FocusColumn>("sessions");
  const [cursorArea, setCursorArea] = useState<"actions" | "sessions">("actions");
  const [sessionCursor, setSessionCursor] = useState(0);
  const [repoCursor, setRepoCursor] = useState(0);
  const [teamCursor, setTeamCursor] = useState(0);
  const [focusedButton, setFocusedButton] = useState(0);
  const [sessionScrollOffset, setSessionScrollOffset] = useState(0);
  const [repoScrollOffset, setRepoScrollOffset] = useState(0);
  const [teamScrollOffset, setTeamScrollOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showStaleNudge, setShowStaleNudge] = useState(true);
  const [lastLeftColumn, setLastLeftColumn] = useState<"sessions" | "team">("sessions");
  const [moshEnabled, setMoshEnabled] = useState(initialMoshEnabled);

  // For narrow layout, focusColumn doubles as the active tab
  const narrowTab = focusColumn;

  // Determine which columns are available
  const hasRepos = repos.length > 0;
  const hasTeam = team.length > 0;

  // Available columns in order
  const availableColumns: FocusColumn[] = ["sessions", ...(hasRepos ? ["repos" as const] : []), ...(hasTeam ? ["team" as const] : [])];

  // Current list / max items for current column
  const currentMaxItems = focusColumn === "sessions" ? mine.length
    : focusColumn === "repos" ? repos.length
    : team.length;

  const currentCursor = focusColumn === "sessions" ? sessionCursor
    : focusColumn === "repos" ? repoCursor
    : teamCursor;

  const setCurrentCursor = focusColumn === "sessions" ? setSessionCursor
    : focusColumn === "repos" ? setRepoCursor
    : setTeamCursor;

  const currentScrollOffset = focusColumn === "sessions" ? sessionScrollOffset
    : focusColumn === "repos" ? repoScrollOffset
    : teamScrollOffset;

  const setCurrentScrollOffset = focusColumn === "sessions" ? setSessionScrollOffset
    : focusColumn === "repos" ? setRepoScrollOffset
    : setTeamScrollOffset;

  const maxVisible = Math.max(3, rows - 14);

  // Move cursor and scroll offset together
  const moveCursor = useCallback(
    (delta: number) => {
      setCurrentCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, currentMaxItems - 1));
        setCurrentScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + maxVisible) return next - maxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [currentMaxItems, maxVisible, setCurrentCursor, setCurrentScrollOffset],
  );

  // Clamp cursors when lists change
  useEffect(() => {
    setSessionCursor(c => Math.min(c, Math.max(0, mine.length - 1)));
  }, [mine.length]);
  useEffect(() => {
    setRepoCursor(c => Math.min(c, Math.max(0, repos.length - 1)));
  }, [repos.length]);
  useEffect(() => {
    setTeamCursor(c => Math.min(c, Math.max(0, team.length - 1)));
  }, [team.length]);

  // Auto-dismiss stale nudge after 5s
  useEffect(() => {
    if (stale.length > 0 && !loading && showStaleNudge) {
      const timer = setTimeout(() => setShowStaleNudge(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [stale.length, loading, showStaleNudge]);

  // Cycle to next available column
  const cycleColumn = useCallback(() => {
    const idx = availableColumns.indexOf(focusColumn);
    const next = availableColumns[(idx + 1) % availableColumns.length];
    setFocusColumn(next);
  }, [availableColumns, focusColumn]);

  const doRefresh = useCallback(() => {
    setSelected(new Set());
    refresh();
    refreshRepos();
  }, [refresh, refreshRepos]);

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
            action: () => {
              setSelected(new Set(stale.map((s) => s.name)));
              setDashMode({ mode: "confirm-bulk", sessionNames: stale.map((s) => s.name) });
            },
          },
        ]
      : []),
    { key: "r", label: "Refresh", action: doRefresh },
    ...(!isOnVPS
      ? [
          { key: "s", label: "Setup", action: () => setRoute({ page: "setup" }) },
          {
            key: "m",
            label: moshEnabled ? "Mosh ON" : "Mosh",
            action: () => {
              if (moshEnabled) {
                setMoshEnabled(false);
                saveConfigField("NPDEV_MOSH", "off");
              } else if (isMoshInstalled()) {
                setMoshEnabled(true);
                saveConfigField("NPDEV_MOSH", "on");
              } else {
                setRoute({ page: "mosh-install" });
              }
            },
            highlight: moshEnabled,
          },
          {
            key: "u",
            label: "Update",
            action: () => setRoute({ page: "update" }),
            highlight: !!version.latest,
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

    // Dismiss stale nudge on any keypress
    if (showStaleNudge) setShowStaleNudge(false);

    // Confirm bulk delete
    if (dashMode.mode === "confirm-bulk") {
      if (input === "y" || input === "Y") {
        const names = dashMode.sessionNames;
        setDashMode({ mode: "normal" });
        setSelected(new Set());
        Promise.all(names.map((n) => endSession(n))).catch(() => {});
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setDashMode({ mode: "normal" });
        setSelected(new Set());
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

    // Escape: clear selections if any, otherwise exit
    if (key.escape) {
      if (selected.size > 0) {
        setSelected(new Set());
        return;
      }
      onAction({ type: "exit" });
      return;
    }

    // Tab key: cycle focus
    if (key.tab) {
      if (cursorArea === "actions") {
        setCursorArea("sessions");
        // Focus first available column
        setFocusColumn(availableColumns[0]);
      } else {
        const idx = availableColumns.indexOf(focusColumn);
        if (idx >= availableColumns.length - 1) {
          // Wrap to actions
          setCursorArea("actions");
        } else {
          setFocusColumn(availableColumns[idx + 1]);
        }
      }
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
        if (currentMaxItems > 0 || availableColumns.length > 0) {
          setCursorArea("sessions");
        }
        return;
      }
      if (key.return) {
        buttons[focusedButton]?.action();
        return;
      }
    }

    // Navigation in column area
    if (cursorArea === "sessions") {
      // Up/Down navigation with cross-section logic for normal layout
      if (key.downArrow || input === "j") {
        // In normal layout, down at bottom of sessions → team
        if (layout === "normal" && focusColumn === "sessions" && sessionCursor >= mine.length - 1 && hasTeam) {
          setFocusColumn("team");
          setTeamCursor(0);
          setTeamScrollOffset(0);
          return;
        }
        moveCursor(1);
        return;
      }
      if (key.upArrow || (input === "k" && focusColumn === "repos")) {
        // In normal layout, up at top of team → sessions
        if (layout === "normal" && focusColumn === "team" && teamCursor === 0 && mine.length > 0) {
          setFocusColumn("sessions");
          setSessionCursor(mine.length - 1);
          setSessionScrollOffset(Math.max(0, mine.length - maxVisible));
          return;
        }
        // In repos column, k is vim up (no kill conflict)
        if (currentCursor === 0) {
          setCursorArea("actions");
        } else {
          moveCursor(-1);
        }
        return;
      }
      if (input === "k" && (focusColumn === "sessions" || focusColumn === "team")) {
        // k in sessions or team column = kill
        if (focusColumn === "sessions" && currentMaxItems > 0 && sessionCursor < mine.length) {
          if (selected.size > 0) {
            setDashMode({ mode: "confirm-bulk", sessionNames: [...selected] });
          } else {
            setDashMode({ mode: "confirm-end", sessionName: mine[sessionCursor].name });
          }
        } else if (focusColumn === "team" && team.length > 0 && teamCursor < team.length) {
          setDashMode({ mode: "confirm-end", sessionName: team[teamCursor].name });
        }
        return;
      }

      // Left/Right: move between columns
      if (key.leftArrow || key.rightArrow) {
        if (layout === "narrow") {
          // In narrow layout, left/right switch tabs
          const idx = availableColumns.indexOf(focusColumn);
          if (key.rightArrow) {
            setFocusColumn(availableColumns[(idx + 1) % availableColumns.length]);
          } else {
            setFocusColumn(availableColumns[(idx - 1 + availableColumns.length) % availableColumns.length]);
          }
        } else if (layout === "normal") {
          // Normal layout: left side = sessions/team, right side = repos
          // Left/Right toggles between left side and repos
          if (key.rightArrow && (focusColumn === "sessions" || focusColumn === "team") && hasRepos) {
            setLastLeftColumn(focusColumn);
            setFocusColumn("repos");
          } else if (key.leftArrow && focusColumn === "repos") {
            setFocusColumn(lastLeftColumn);
          }
        } else {
          // Wide layout: all columns side by side
          const idx = availableColumns.indexOf(focusColumn);
          if (key.rightArrow && idx < availableColumns.length - 1) {
            setFocusColumn(availableColumns[idx + 1]);
          } else if (key.leftArrow && idx > 0) {
            setFocusColumn(availableColumns[idx - 1]);
          }
        }
        return;
      }

      // Enter to select
      if (key.return && currentMaxItems > 0 && currentCursor < currentMaxItems) {
        if (focusColumn === "team") {
          onAction({ type: "join-team", sessionName: team[teamCursor].name });
        } else if (focusColumn === "repos") {
          const repo = repos[repoCursor];
          setRoute({ page: "repo-detail", repoPath: repo.path, repoName: repo.name });
        } else {
          onAction({ type: "resume", sessionName: mine[sessionCursor].name });
        }
        return;
      }

      // Space to toggle-select (sessions column only)
      if (input === " " && focusColumn === "sessions" && mine.length > 0 && sessionCursor < mine.length) {
        const name = mine[sessionCursor].name;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
          } else {
            next.add(name);
          }
          return next;
        });
        return;
      }
    }

    // Global shortcut keys (work in any cursor area)
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

  // --- Route: New Session in Repo ---
  if (route.page === "new-session-in-repo") {
    const { repoPath, repoName } = route;
    return (
      <NewSessionPage
        title={`NEW SESSION IN ${repoName.toUpperCase()}`}
        onSubmit={(name) => onAction({ type: "new-session-in-repo", sessionName: name, repoPath })}
        onBack={() => setRoute({ page: "repo-detail", repoPath, repoName })}
      />
    );
  }

  // --- Route: Repo Detail ---
  if (route.page === "repo-detail") {
    const { repoPath, repoName } = route;
    const repo = repos.find(r => r.path === repoPath) || { path: repoPath, name: repoName, branch: "unknown" };
    return (
      <RepoDetailPage
        machine={machine}
        repo={repo}
        sessions={sessions}
        onAction={onAction}
        onBack={() => setRoute({ page: "dashboard" })}
        onNewSession={() => setRoute({ page: "new-session-in-repo", repoPath, repoName })}
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

  // --- Route: Mosh Install ---
  if (route.page === "mosh-install") {
    return (
      <MoshInstallPage
        onInstalled={() => {
          setMoshEnabled(true);
          saveConfigField("NPDEV_MOSH", "on");
          setRoute({ page: "dashboard" });
        }}
        onBack={() => setRoute({ page: "dashboard" })}
      />
    );
  }

  // --- Route: Dashboard ---
  const contentWidth = cols - 4;
  const isEmpty = mine.length === 0 && team.length === 0;

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
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <SkeletonLoader cols={cols} rows={rows} />
        </Box>
      </Box>
    );
  }

  const panelFocusedSessions = cursorArea === "sessions" && focusColumn === "sessions";
  const panelFocusedRepos = cursorArea === "sessions" && focusColumn === "repos";
  const panelFocusedTeam = cursorArea === "sessions" && focusColumn === "team";

  // Determine number of visible columns for wide layout
  const visibleColumnCount = 1 + (hasRepos ? 1 : 0) + (hasTeam ? 1 : 0);

  const sessionPanels = isEmpty && !hasRepos ? (
    <Box flexGrow={1} paddingY={1}>
      <EmptyState />
    </Box>
  ) : layout === "wide" ? (
    // Wide layout: up to 3 columns side by side
    <Box flexDirection="row" gap={2} flexGrow={1}>
      {mine.length > 0 ? (
        <SessionList
          sessions={mine}
          repos={repos}
          selectedIndex={focusColumn === "sessions" ? sessionCursor : -1}
          selectable={panelFocusedSessions}
          focused={panelFocusedSessions}
          layout={layout}
          width={Math.floor(contentWidth / visibleColumnCount) - 2}
          scrollOffset={focusColumn === "sessions" ? sessionScrollOffset : 0}
          maxVisible={maxVisible}
          selected={selected}
        />
      ) : (
        <Box flexGrow={1} paddingY={1}>
          <EmptyState />
        </Box>
      )}
      {hasRepos && (
        <RepoList
          repos={repos}
          sessions={sessions}
          selectedIndex={repoCursor}
          focused={panelFocusedRepos}
          width={Math.floor(contentWidth / visibleColumnCount) - 2}
          scrollOffset={repoScrollOffset}
          maxVisible={maxVisible}
        />
      )}
      {hasTeam && (
        <TeamSection
          sessions={team}
          repos={repos}
          selectedIndex={focusColumn === "team" ? teamCursor : -1}
          selectable={panelFocusedTeam}
          focused={panelFocusedTeam}
          layout={layout}
          width={Math.floor(contentWidth / visibleColumnCount) - 2}
          scrollOffset={focusColumn === "team" ? teamScrollOffset : 0}
          maxVisible={maxVisible}
        />
      )}
    </Box>
  ) : layout === "normal" ? (
    // Normal layout: 2 columns — [Sessions/Team stacked] [Repos]
    <Box flexDirection="row" gap={2} flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {mine.length > 0 ? (
          <SessionList
            sessions={mine}
            repos={repos}
            selectedIndex={focusColumn === "sessions" ? sessionCursor : -1}
            selectable={panelFocusedSessions}
            focused={panelFocusedSessions}
            layout={layout}
            width={hasRepos ? Math.floor(contentWidth / 2) - 2 : contentWidth}
            scrollOffset={sessionScrollOffset}
            maxVisible={hasTeam ? Math.max(2, Math.floor(maxVisible / 2)) : maxVisible}
            selected={selected}
          />
        ) : (
          <Box flexGrow={1} paddingY={1}>
            <EmptyState />
          </Box>
        )}
        {hasTeam && (
          <TeamSection
            sessions={team}
            repos={repos}
            selectedIndex={focusColumn === "team" ? teamCursor : -1}
            selectable={panelFocusedTeam}
            focused={panelFocusedTeam}
            layout={layout}
            width={hasRepos ? Math.floor(contentWidth / 2) - 2 : contentWidth}
            scrollOffset={teamScrollOffset}
            maxVisible={Math.max(2, Math.floor(maxVisible / 2))}
          />
        )}
      </Box>
      {hasRepos && (
        <RepoList
          repos={repos}
          sessions={sessions}
          selectedIndex={repoCursor}
          focused={panelFocusedRepos}
          width={Math.floor(contentWidth / 2) - 2}
          scrollOffset={repoScrollOffset}
          maxVisible={maxVisible}
        />
      )}
    </Box>
  ) : (
    // Narrow layout: tabs
    <Box flexDirection="column" flexGrow={1}>
      <TabBar
        activeTab={narrowTab}
        sessionCount={mine.length}
        teamCount={team.length}
        repoCount={repos.length}
      />
      {narrowTab === "sessions" ? (
        mine.length > 0 ? (
          <SessionList
            sessions={mine}
            repos={repos}
            selectedIndex={cursorArea === "sessions" ? sessionCursor : -1}
            selectable={panelFocusedSessions}
            focused={panelFocusedSessions}
            layout={layout}
            width={contentWidth}
            scrollOffset={sessionScrollOffset}
            maxVisible={maxVisible}
            selected={selected}
          />
        ) : (
          <Box flexGrow={1} paddingY={1}>
            <EmptyState />
          </Box>
        )
      ) : narrowTab === "team" ? (
        <TeamSection
          sessions={team}
          repos={repos}
          selectedIndex={cursorArea === "sessions" ? teamCursor : -1}
          selectable={panelFocusedTeam}
          focused={panelFocusedTeam}
          layout={layout}
          width={contentWidth}
          scrollOffset={teamScrollOffset}
          maxVisible={maxVisible}
        />
      ) : (
        hasRepos && (
          <RepoList
            repos={repos}
            sessions={sessions}
            selectedIndex={repoCursor}
            focused={panelFocusedRepos}
            width={contentWidth}
            scrollOffset={repoScrollOffset}
            maxVisible={maxVisible}
          />
        )
      )}
    </Box>
  );

  const confirmEndName = dashMode.mode === "confirm-end" ? dashMode.sessionName : undefined;
  const confirmBulkNames = dashMode.mode === "confirm-bulk" ? dashMode.sessionNames : undefined;

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
      {showStaleNudge && stale.length > 0 && (
        <StaleNudge count={stale.length} />
      )}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {sessionPanels}
      </Box>
      <StatusLine
        mode={
          dashMode.mode === "confirm-end"
            ? "confirm-end"
            : dashMode.mode === "confirm-bulk"
              ? "confirm-bulk"
              : "dashboard"
        }
        focusColumn={focusColumn}
        staleCount={stale.length}
        sessionCount={mine.length + team.length}
        confirmEndName={confirmEndName}
        confirmBulkNames={confirmBulkNames}
        selectionCount={selected.size}
        cols={cols}
      />
    </Box>
  );
}
