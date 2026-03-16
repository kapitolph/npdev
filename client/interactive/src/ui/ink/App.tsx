import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { saveConfigField } from "../../lib/config";
import { isMoshInstalled } from "../../lib/mosh";
import { deriveRepoName, relativeTime } from "../../lib/sessions";
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
import { UploadPage } from "./components/UploadPage";
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
  | { page: "upload" }
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
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // For narrow layout, focusColumn doubles as the active tab
  const narrowTab = focusColumn;

  // Determine which columns are available
  const hasRepos = repos.length > 0;
  const hasTeam = team.length > 0;

  // Search filtering — filter both mine and team by query
  const searchLower = searchQuery.toLowerCase();
  const filteredMine = searchActive && searchQuery
    ? mine.filter(s => {
        const repo = deriveRepoName(s, repos) || "";
        return s.name.toLowerCase().includes(searchLower)
          || s.owner.toLowerCase().includes(searchLower)
          || s.description.toLowerCase().includes(searchLower)
          || repo.toLowerCase().includes(searchLower);
      })
    : mine;
  const filteredTeam = searchActive && searchQuery
    ? team.filter(s => {
        const repo = deriveRepoName(s, repos) || "";
        return s.name.toLowerCase().includes(searchLower)
          || s.owner.toLowerCase().includes(searchLower)
          || s.description.toLowerCase().includes(searchLower)
          || repo.toLowerCase().includes(searchLower);
      })
    : team;
  const searchResultCount = searchActive ? filteredMine.length + filteredTeam.length : undefined;

  // Available columns in order
  const availableColumns: FocusColumn[] = ["sessions", ...(hasRepos ? ["repos" as const] : []), ...(hasTeam ? ["team" as const] : [])];

  // Current list / max items for current column
  const currentMaxItems = focusColumn === "sessions" ? filteredMine.length
    : focusColumn === "repos" ? repos.length
    : filteredTeam.length;

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

  // Each session/repo row is 2 lines tall
  // Chrome: header (logo+info) + buttons + description + status line
  // Full logo ~10 lines, compact logo ~3 lines, narrow ~2 lines
  const compactLogo = rows < 30;
  const chromeHeight = layout === "narrow" ? 8 : compactLogo ? 8 : 14;
  // Section headers take ~3 lines each (paddingTop + text + paddingBottom)
  const sectionHeaderHeight = 3;
  const contentRows = rows - chromeHeight;
  const maxVisible = Math.max(2, Math.floor((contentRows - sectionHeaderHeight) / 2));
  // In stacked mode (normal layout with team), each half gets its own section header
  const maxVisibleStacked = Math.max(2, Math.floor((contentRows - sectionHeaderHeight * 2) / 4));

  // Effective maxVisible for the current column (stacked sections get fewer rows)
  const isStacked = layout === "normal" && filteredTeam.length > 0 && (focusColumn === "sessions" || focusColumn === "team");
  const effectiveMaxVisible = isStacked ? maxVisibleStacked : maxVisible;

  // Move cursor and scroll offset together
  const moveCursor = useCallback(
    (delta: number) => {
      setCurrentCursor((prev) => {
        const next = Math.max(0, Math.min(prev + delta, currentMaxItems - 1));
        setCurrentScrollOffset((offset) => {
          if (next < offset) return next;
          if (next >= offset + effectiveMaxVisible) return next - effectiveMaxVisible + 1;
          return offset;
        });
        return next;
      });
    },
    [currentMaxItems, effectiveMaxVisible, setCurrentCursor, setCurrentScrollOffset],
  );

  // Clamp cursors when lists change
  useEffect(() => {
    setSessionCursor(c => Math.min(c, Math.max(0, filteredMine.length - 1)));
  }, [filteredMine.length]);
  useEffect(() => {
    setRepoCursor(c => Math.min(c, Math.max(0, repos.length - 1)));
  }, [repos.length]);
  useEffect(() => {
    setTeamCursor(c => Math.min(c, Math.max(0, filteredTeam.length - 1)));
  }, [filteredTeam.length]);

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
      description: "Create a new tmux session",
      action: () => setRoute({ page: "new-session" }),
    },
    ...(stale.length > 0
      ? [
          {
            key: "c",
            label: `Clean ${stale.length}`,
            description: `End ${stale.length} stale session${stale.length > 1 ? "s" : ""} (3+ business days idle)`,
            action: () => {
              setSelected(new Set(stale.map((s) => s.name)));
              setDashMode({ mode: "confirm-bulk", sessionNames: stale.map((s) => s.name) });
            },
          },
        ]
      : []),
    { key: "r", label: "Refresh", description: "Reload sessions and repos", action: doRefresh },
    { key: "f", label: "Upload", description: "Upload a file to a project on the VPS", action: () => setRoute({ page: "upload" }) },
    ...(!isOnVPS
      ? [
          {
            key: "s",
            label: "Setup",
            description: "Configure your developer identity (git + GitHub)",
            action: () => setRoute({ page: "setup" }),
          },
          // TODO: unhide mosh button once UDP ports are exposed on VPS
          // {
          //   key: "m",
          //   label: `${moshEnabled ? "☑" : "☐"} Mosh`,
          //   description: "Resilient connection — survives Wi-Fi drops, roaming, and high latency",
          //   action: () => {
          //     if (moshEnabled) {
          //       setMoshEnabled(false);
          //       saveConfigField("NPDEV_MOSH", "off");
          //     } else if (isMoshInstalled()) {
          //       setMoshEnabled(true);
          //       saveConfigField("NPDEV_MOSH", "on");
          //     } else {
          //       setRoute({ page: "mosh-install" });
          //     }
          //   },
          //   active: moshEnabled,
          // },
          {
            key: "u",
            label: "Update",
            description: version.latest ? `New version available: v${version.latest}` : "Check for npdev updates",
            action: () => setRoute({ page: "update" }),
            highlight: !!version.latest,
          },
        ]
      : []),
    {
      key: "/",
      label: "Search",
      description: "Search sessions by name, owner, or description",
      action: () => {
        setSearchActive(true);
        setSearchQuery("");
        setCursorArea("sessions");
        setFocusColumn("sessions");
        setSessionCursor(0);
        setSessionScrollOffset(0);
        setTeamCursor(0);
        setTeamScrollOffset(0);
      },
    },
    { key: "q", label: "Quit", description: "Exit npdev", action: () => onAction({ type: "exit" }) },
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

    // Search mode input handling
    if (searchActive) {
      if (key.escape) {
        setSearchActive(false);
        setSearchQuery("");
        return;
      }
      if (key.return) {
        // Select the highlighted result
        if (focusColumn === "sessions" && filteredMine.length > 0 && sessionCursor < filteredMine.length) {
          const s = filteredMine[sessionCursor];
          setSearchActive(false);
          setSearchQuery("");
          onAction({ type: "resume", sessionName: s.name });
        } else if (focusColumn === "team" && filteredTeam.length > 0 && teamCursor < filteredTeam.length) {
          const s = filteredTeam[teamCursor];
          setSearchActive(false);
          setSearchQuery("");
          onAction({ type: "join-team", sessionName: s.name });
        }
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery(q => q.slice(0, -1));
        setSessionCursor(0);
        setSessionScrollOffset(0);
        setTeamCursor(0);
        setTeamScrollOffset(0);
        return;
      }
      if (key.downArrow) {
        // Navigate within filtered results, cross from sessions to team
        if (focusColumn === "sessions" && sessionCursor >= filteredMine.length - 1 && filteredTeam.length > 0) {
          setFocusColumn("team");
          setTeamCursor(0);
          setTeamScrollOffset(0);
        } else {
          moveCursor(1);
        }
        return;
      }
      if (key.upArrow) {
        if (focusColumn === "team" && teamCursor === 0 && filteredMine.length > 0) {
          setFocusColumn("sessions");
          setSessionCursor(filteredMine.length - 1);
          setSessionScrollOffset(Math.max(0, filteredMine.length - effectiveMaxVisible));
        } else {
          moveCursor(-1);
        }
        return;
      }
      // Tab to switch between sessions and team results
      if (key.tab) {
        if (focusColumn === "sessions" && filteredTeam.length > 0) {
          setFocusColumn("team");
          setTeamCursor(0);
          setTeamScrollOffset(0);
        } else if (focusColumn === "team" && filteredMine.length > 0) {
          setFocusColumn("sessions");
          setSessionCursor(0);
          setSessionScrollOffset(0);
        }
        return;
      }
      // Regular character input → append to search query
      if (input && !key.ctrl && !key.meta && input.length === 1 && input.charCodeAt(0) >= 32) {
        setSearchQuery(q => q + input);
        setSessionCursor(0);
        setSessionScrollOffset(0);
        setTeamCursor(0);
        setTeamScrollOffset(0);
        return;
      }
      return;
    }

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
        if (layout === "normal" && focusColumn === "sessions" && sessionCursor >= filteredMine.length - 1 && hasFilteredTeam) {
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
        if (layout === "normal" && focusColumn === "team" && teamCursor === 0 && filteredMine.length > 0) {
          setFocusColumn("sessions");
          setSessionCursor(filteredMine.length - 1);
          setSessionScrollOffset(Math.max(0, filteredMine.length - maxVisibleStacked));
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
        if (focusColumn === "sessions" && currentMaxItems > 0 && sessionCursor < filteredMine.length) {
          if (selected.size > 0) {
            setDashMode({ mode: "confirm-bulk", sessionNames: [...selected] });
          } else {
            setDashMode({ mode: "confirm-end", sessionName: filteredMine[sessionCursor].name });
          }
        } else if (focusColumn === "team" && filteredTeam.length > 0 && teamCursor < filteredTeam.length) {
          setDashMode({ mode: "confirm-end", sessionName: filteredTeam[teamCursor].name });
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
          if (key.rightArrow && (focusColumn === "sessions" || focusColumn === "team") && hasRepos && !searchActive) {
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
          onAction({ type: "join-team", sessionName: filteredTeam[teamCursor].name });
        } else if (focusColumn === "repos") {
          const repo = repos[repoCursor];
          setRoute({ page: "repo-detail", repoPath: repo.path, repoName: repo.name });
        } else {
          onAction({ type: "resume", sessionName: filteredMine[sessionCursor].name });
        }
        return;
      }

      // Space to toggle-select (sessions column only)
      if (input === " " && focusColumn === "sessions" && filteredMine.length > 0 && sessionCursor < filteredMine.length) {
        const name = filteredMine[sessionCursor].name;
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

  // --- Route: Upload ---
  if (route.page === "upload") {
    return (
      <UploadPage
        machine={machine}
        repos={repos}
        isOnVPS={isOnVPS}
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
  const isEmpty = filteredMine.length === 0 && filteredTeam.length === 0 && !searchActive;

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
  const showRepos = hasRepos && !searchActive;
  const hasFilteredTeam = filteredTeam.length > 0;
  const visibleColumnCount = 1 + (showRepos ? 1 : 0) + (hasFilteredTeam ? 1 : 0);

  const sessionPanels = isEmpty && !showRepos ? (
    <Box flexGrow={1} paddingY={1}>
      <EmptyState />
    </Box>
  ) : layout === "wide" ? (
    // Wide layout: up to 3 columns side by side
    <Box flexDirection="row" gap={2} flexGrow={1}>
      {filteredMine.length > 0 ? (
        <SessionList
          sessions={filteredMine}
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
        !searchActive && (
          <Box flexGrow={1} paddingY={1}>
            <EmptyState />
          </Box>
        )
      )}
      {showRepos && (
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
      {hasFilteredTeam && (
        <TeamSection
          sessions={filteredTeam}
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
        {filteredMine.length > 0 ? (
          <SessionList
            sessions={filteredMine}
            repos={repos}
            selectedIndex={focusColumn === "sessions" ? sessionCursor : -1}
            selectable={panelFocusedSessions}
            focused={panelFocusedSessions}
            layout={layout}
            width={showRepos ? Math.floor(contentWidth / 2) - 2 : contentWidth}
            scrollOffset={sessionScrollOffset}
            maxVisible={hasFilteredTeam ? maxVisibleStacked : maxVisible}
            selected={selected}
          />
        ) : (
          !searchActive && (
            <Box flexGrow={1} paddingY={1}>
              <EmptyState />
            </Box>
          )
        )}
        {hasFilteredTeam && (
          <TeamSection
            sessions={filteredTeam}
            repos={repos}
            selectedIndex={focusColumn === "team" ? teamCursor : -1}
            selectable={panelFocusedTeam}
            focused={panelFocusedTeam}
            layout={layout}
            width={showRepos ? Math.floor(contentWidth / 2) - 2 : contentWidth}
            scrollOffset={teamScrollOffset}
            maxVisible={maxVisibleStacked}
          />
        )}
      </Box>
      {showRepos && (
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
        sessionCount={filteredMine.length}
        teamCount={filteredTeam.length}
        repoCount={repos.length}
      />
      {narrowTab === "sessions" ? (
        filteredMine.length > 0 ? (
          <SessionList
            sessions={filteredMine}
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
          sessions={filteredTeam}
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

  // Context-sensitive description for the description area when browsing columns
  let contextDescription: string | undefined;
  if (cursorArea === "sessions" && !searchActive) {
    if (focusColumn === "sessions" && filteredMine.length > 0 && sessionCursor < filteredMine.length) {
      const s = filteredMine[sessionCursor];
      const attached = (s.attached_users || "").split(",").filter(Boolean);
      const others = attached.filter(u => u !== npdevUser);
      const parts = [`Enter your session "${s.name}"`];
      if (others.length > 0) parts.push(`${others.join(", ")} online`);
      else if (parseInt(s.client_count || "0", 10) === 0) parts.push(`idle ${relativeTime(s.last_activity)}`);
      contextDescription = parts.join(" · ");
    } else if (focusColumn === "team" && filteredTeam.length > 0 && teamCursor < filteredTeam.length) {
      const s = filteredTeam[teamCursor];
      const attached = (s.attached_users || "").split(",").filter(Boolean);
      const isActive = parseInt(s.client_count || "0", 10) > 0;
      const parts = [`Join ${s.owner}'s session "${s.name}"`];
      if (isActive && attached.length > 0) parts.push(`${attached.join(", ")} online`);
      else parts.push(`idle ${relativeTime(s.last_activity)}`);
      contextDescription = parts.join(" · ");
    } else if (focusColumn === "repos" && repos.length > 0 && repoCursor < repos.length) {
      const repo = repos[repoCursor];
      const activeUsers = [...new Set(
        sessions
          .filter(s => s.pane_cwd?.startsWith(repo.path) && parseInt(s.client_count || "0", 10) > 0)
          .flatMap(s => (s.attached_users || s.owner || "").split(",").filter(Boolean)),
      )];
      const parts = [`View details for ${repo.name}`];
      if (activeUsers.length > 0) parts.push(`${activeUsers.join(", ")} active`);
      contextDescription = parts.join(" · ");
    }
  }

  const confirmEndName = dashMode.mode === "confirm-end" ? dashMode.sessionName : undefined;
  const confirmBulkNames = dashMode.mode === "confirm-bulk" ? dashMode.sessionNames : undefined;

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Header
        machineName={machine.name}
        npdevUser={npdevUser}
        version={version}
        cols={cols}
        rows={rows}
        layout={layout}
        isOnVPS={isOnVPS}
      />
      <Box paddingX={1} paddingBottom={1}>
        <ButtonBar
          buttons={buttons}
          focusedIndex={focusedButton}
          isFocusZone={cursorArea === "actions" && !searchActive}
          contextDescription={cursorArea === "sessions" && !searchActive ? contextDescription : undefined}
          searchQuery={searchActive ? searchQuery : undefined}
          searchResultCount={searchResultCount}
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
