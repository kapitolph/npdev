import { Box, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { saveConfigField } from "../../lib/config";
import { isMoshInstalled } from "../../lib/mosh";
import { deriveRepoName, relativeTime } from "../../lib/sessions";
import { sshExec } from "../../lib/ssh";
import type { Machine, RepoData, VersionInfo } from "../../types";
import type { ButtonDef } from "./components/ButtonBar";
import { ButtonBar } from "./components/ButtonBar";
import { DIARY_ITEM_COUNT, DiaryColumn } from "./components/DiaryColumn";
import { DiaryDetailPage } from "./components/DiaryDetailPage";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { MoshInstallPage } from "./components/MoshInstallPage";
import { NewSessionPage } from "./components/NewSessionPage";
import { PeekSliver } from "./components/PeekSliver";
import { ProfilesPage } from "./components/ProfilesPage";
import { RepoDetailPage } from "./components/RepoDetailPage";
import { RepoList } from "./components/RepoList";
import { SessionList } from "./components/SessionList";
import { SetupPage } from "./components/SetupPage";
import { SkeletonLoader } from "./components/SkeletonLoader";
import { StaleNudge } from "./components/StaleNudge";
import { StatusLine } from "./components/StatusLine";
import { TeamSection } from "./components/TeamSection";
import { UpdateChannelPage } from "./components/UpdateChannelPage";
import { UpdatePage } from "./components/UpdatePage";
import { UploadPage } from "./components/UploadPage";
import { useTheme } from "./context/ThemeContext";
import { useDiary } from "./hooks/useDiary";
import { useRepos } from "./hooks/useRepos";
import { useSessions } from "./hooks/useSessions";
import { useTerminalSize } from "./hooks/useTerminalSize";
import { useViewport } from "./hooks/useViewport";

type Route =
  | { page: "dashboard" }
  | { page: "new-session" }
  | { page: "new-session-in-repo"; repoPath: string; repoName: string }
  | { page: "repo-detail"; repoPath: string; repoName: string }
  | { page: "update-select" }
  | { page: "update"; channel: "stable" | "nightly" }
  | { page: "setup" }
  | { page: "upload" }
  | { page: "mosh-install" }
  | { page: "diary-detail"; diaryType: "3h" | "eod" }
  | { page: "profiles" };

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
  | { type: "ccp-login"; profileName: string }
  | { type: "cxp-login"; profileName: string }
  | { type: "update-done" }
  | { type: "exit" };

type FocusColumn = "sessions" | "diary" | "repos" | "team";

/** Map column IDs to their display labels for peek slivers */
const COLUMN_LABELS: Record<FocusColumn, string> = {
  sessions: "Sessions",
  diary: "Diary",
  repos: "Repos",
  team: "Team",
};

interface Props {
  machine: Machine;
  npdevUser: string;
  version: VersionInfo;
  isOnVPS: boolean;
  initialMoshEnabled: boolean;
  onAction: (action: AppAction) => void;
}

export function App({ machine, npdevUser, version, isOnVPS, initialMoshEnabled, onAction }: Props) {
  const { sessions, mine, team, stale, loading, refresh, removeSession, silentRefresh } = useSessions(machine, npdevUser);
  const { repos, loading: reposLoading, refresh: refreshRepos } = useRepos(machine);
  const { diary, refresh: refreshDiary } = useDiary(machine);
  const { cols, rows } = useTerminalSize();
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
  const [diaryCursor, setDiaryCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showStaleNudge, setShowStaleNudge] = useState(true);
  const [moshEnabled, setMoshEnabled] = useState(initialMoshEnabled);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Determine which columns are available
  const hasRepos = repos.length > 0;
  const hasTeam = team.length > 0;

  // Search filtering
  const searchLower = searchQuery.toLowerCase();
  const filteredMine =
    searchActive && searchQuery
      ? mine.filter((s) => {
          const repo = deriveRepoName(s, repos) || "";
          return (
            s.name.toLowerCase().includes(searchLower) ||
            s.owner.toLowerCase().includes(searchLower) ||
            s.description.toLowerCase().includes(searchLower) ||
            repo.toLowerCase().includes(searchLower)
          );
        })
      : mine;
  const filteredTeam =
    searchActive && searchQuery
      ? team.filter((s) => {
          const repo = deriveRepoName(s, repos) || "";
          return (
            s.name.toLowerCase().includes(searchLower) ||
            s.owner.toLowerCase().includes(searchLower) ||
            s.description.toLowerCase().includes(searchLower) ||
            repo.toLowerCase().includes(searchLower)
          );
        })
      : team;
  const searchResultCount = searchActive ? filteredMine.length + filteredTeam.length : undefined;
  const hasFilteredTeam = filteredTeam.length > 0;

  // Available columns in order — repos hidden during search
  const showRepos = hasRepos && !searchActive;
  const hasDiary = diary.latest3h !== null || diary.latestEod !== null;
  const availableColumns: FocusColumn[] = [
    "sessions",
    ...(hasDiary && !searchActive ? ["diary" as const] : []),
    ...(showRepos ? ["repos" as const] : []),
    ...(hasFilteredTeam ? ["team" as const] : []),
  ];

  // Viewport hook
  const viewport = useViewport(cols, availableColumns.length);

  // Ensure focused column is visible in viewport when focus changes
  useEffect(() => {
    const idx = availableColumns.indexOf(focusColumn);
    if (idx >= 0) viewport.ensureVisible(idx);
  }, [focusColumn, availableColumns.length]);

  // Current list / max items for current column
  const currentMaxItems =
    focusColumn === "sessions"
      ? filteredMine.length
      : focusColumn === "diary"
        ? DIARY_ITEM_COUNT
        : focusColumn === "repos"
          ? repos.length
          : filteredTeam.length;

  const currentCursor =
    focusColumn === "sessions"
      ? sessionCursor
      : focusColumn === "diary"
        ? diaryCursor
        : focusColumn === "repos"
          ? repoCursor
          : teamCursor;

  const setCurrentCursor =
    focusColumn === "sessions"
      ? setSessionCursor
      : focusColumn === "diary"
        ? setDiaryCursor
        : focusColumn === "repos"
          ? setRepoCursor
          : setTeamCursor;

  const currentScrollOffset =
    focusColumn === "sessions"
      ? sessionScrollOffset
      : focusColumn === "diary"
        ? 0
        : focusColumn === "repos"
          ? repoScrollOffset
          : teamScrollOffset;

  const setCurrentScrollOffset =
    focusColumn === "sessions"
      ? setSessionScrollOffset
      : focusColumn === "diary"
        ? () => {}
        : focusColumn === "repos"
          ? setRepoScrollOffset
          : setTeamScrollOffset;

  // Chrome height calculation
  const compactLogo = rows < 30;
  const chromeHeight = compactLogo ? 8 : 14;
  const sectionHeaderHeight = 3;
  const contentRows = rows - chromeHeight;
  const maxVisible = Math.max(2, Math.floor((contentRows - sectionHeaderHeight) / 2));

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
    setSessionCursor((c) => Math.min(c, Math.max(0, filteredMine.length - 1)));
  }, [filteredMine.length]);
  useEffect(() => {
    setRepoCursor((c) => Math.min(c, Math.max(0, repos.length - 1)));
  }, [repos.length]);
  useEffect(() => {
    setTeamCursor((c) => Math.min(c, Math.max(0, filteredTeam.length - 1)));
  }, [filteredTeam.length]);

  // Auto-dismiss stale nudge after 5s
  useEffect(() => {
    if (stale.length > 0 && !loading && showStaleNudge) {
      const timer = setTimeout(() => setShowStaleNudge(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [stale.length, loading, showStaleNudge]);

  const doRefresh = useCallback(() => {
    setSelected(new Set());
    refresh();
    refreshRepos();
    refreshDiary();
  }, [refresh, refreshRepos, refreshDiary]);

  const endSession = useCallback(
    async (name: string) => {
      removeSession(name);
      await sshExec(machine, `bash ~/.vps/session.sh end '${name}'`);
      silentRefresh();
    },
    [machine, removeSession, silentRefresh],
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
    {
      key: "f",
      label: "Upload",
      description: "Upload a file to a project on the VPS",
      action: () => setRoute({ page: "upload" }),
    },
    ...(!isOnVPS
      ? [
          {
            key: "s",
            label: "Setup",
            description: "Configure your developer identity (git + GitHub)",
            action: () => setRoute({ page: "setup" }),
          },
          {
            key: "u",
            label: "Update",
            description: version.latest
              ? `New version available: v${version.latest}`
              : version.latestNightly && version.channel !== "nightly"
                ? `Nightly available: v${version.latestNightly.version}`
                : "Check for npdev updates",
            action: () => setRoute({ page: "update-select" }),
            highlight:
              !!version.latest || (!!version.latestNightly && version.channel !== "nightly"),
            highlightColor: !version.latest && !!version.latestNightly ? theme.lavender : undefined,
          },
        ]
      : []),
    {
      key: "p",
      label: "Profiles",
      description: "Manage agent credential profiles",
      action: () => setRoute({ page: "profiles" }),
    },
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
    {
      key: "q",
      label: "Quit",
      description: "Exit npdev",
      action: () => onAction({ type: "exit" }),
    },
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
        if (
          focusColumn === "sessions" &&
          filteredMine.length > 0 &&
          sessionCursor < filteredMine.length
        ) {
          const s = filteredMine[sessionCursor];
          setSearchActive(false);
          setSearchQuery("");
          onAction({ type: "resume", sessionName: s.name });
        } else if (
          focusColumn === "team" &&
          filteredTeam.length > 0 &&
          teamCursor < filteredTeam.length
        ) {
          const s = filteredTeam[teamCursor];
          setSearchActive(false);
          setSearchQuery("");
          onAction({ type: "join-team", sessionName: s.name });
        }
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        setSessionCursor(0);
        setSessionScrollOffset(0);
        setTeamCursor(0);
        setTeamScrollOffset(0);
        return;
      }
      if (key.downArrow) {
        if (
          focusColumn === "sessions" &&
          sessionCursor >= filteredMine.length - 1 &&
          hasFilteredTeam
        ) {
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
          setSessionScrollOffset(Math.max(0, filteredMine.length - maxVisible));
        } else {
          moveCursor(-1);
        }
        return;
      }
      if (key.tab) {
        if (focusColumn === "sessions" && hasFilteredTeam) {
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
      if (input && !key.ctrl && !key.meta && input.length === 1 && input.charCodeAt(0) >= 32) {
        setSearchQuery((q) => q + input);
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
        setFocusColumn(availableColumns[0]);
      } else {
        const idx = availableColumns.indexOf(focusColumn);
        if (idx >= availableColumns.length - 1) {
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
      // Diary column: cursor between 2 boxes
      if (focusColumn === "diary") {
        if (key.downArrow || input === "j") {
          setDiaryCursor((prev) => Math.min(prev + 1, DIARY_ITEM_COUNT - 1));
          return;
        }
        if (key.upArrow || input === "k") {
          if (diaryCursor === 0) {
            setCursorArea("actions");
          } else {
            setDiaryCursor((prev) => Math.max(0, prev - 1));
          }
          return;
        }
        if (key.return) {
          const diaryType = diaryCursor === 0 ? ("3h" as const) : ("eod" as const);
          setRoute({ page: "diary-detail", diaryType });
          return;
        }
      }

      // Up/Down navigation for other columns
      if (focusColumn !== "diary" && (key.downArrow || input === "j")) {
        moveCursor(1);
        return;
      }
      if (focusColumn !== "diary" && (key.upArrow || (input === "k" && focusColumn === "repos"))) {
        if (currentCursor === 0) {
          setCursorArea("actions");
        } else {
          moveCursor(-1);
        }
        return;
      }
      if (input === "k" && (focusColumn === "sessions" || focusColumn === "team")) {
        // k in sessions or team column = kill
        if (
          focusColumn === "sessions" &&
          currentMaxItems > 0 &&
          sessionCursor < filteredMine.length
        ) {
          if (selected.size > 0) {
            setDashMode({ mode: "confirm-bulk", sessionNames: [...selected] });
          } else {
            setDashMode({ mode: "confirm-end", sessionName: filteredMine[sessionCursor].name });
          }
        } else if (
          focusColumn === "team" &&
          filteredTeam.length > 0 &&
          teamCursor < filteredTeam.length
        ) {
          setDashMode({ mode: "confirm-end", sessionName: filteredTeam[teamCursor].name });
        }
        return;
      }

      // Left/Right: move between columns (viewport auto-scrolls)
      if (key.leftArrow || key.rightArrow) {
        const idx = availableColumns.indexOf(focusColumn);
        if (key.rightArrow && idx < availableColumns.length - 1) {
          setFocusColumn(availableColumns[idx + 1]);
        } else if (key.leftArrow && idx > 0) {
          setFocusColumn(availableColumns[idx - 1]);
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
      if (
        input === " " &&
        focusColumn === "sessions" &&
        filteredMine.length > 0 &&
        sessionCursor < filteredMine.length
      ) {
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
    const repo = repos.find((r) => r.path === repoPath) || {
      path: repoPath,
      name: repoName,
      branch: "unknown",
    };
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

  // --- Route: Update Channel Selection ---
  if (route.page === "update-select") {
    return (
      <UpdateChannelPage
        latestStable={version.latestStable}
        latestNightly={version.latestNightly}
        currentChannel={version.channel}
        onSelect={(ch) => setRoute({ page: "update", channel: ch })}
        onBack={() => setRoute({ page: "dashboard" })}
      />
    );
  }

  // --- Route: Update ---
  if (route.page === "update") {
    return (
      <UpdatePage
        channel={route.channel}
        nightlyTag={
          route.channel === "nightly" && version.latestNightly
            ? `v${version.latestNightly.version}`
            : undefined
        }
        onDone={() => onAction({ type: "update-done" })}
      />
    );
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

  // --- Route: Diary Detail ---
  if (route.page === "diary-detail") {
    const initialEntry = route.diaryType === "3h" ? diary.latest3h : diary.latestEod;
    return (
      <DiaryDetailPage
        machine={machine}
        type={route.diaryType}
        initialEntry={initialEntry}
        onBack={() => setRoute({ page: "dashboard" })}
      />
    );
  }

  // --- Route: Profiles ---
  if (route.page === "profiles") {
    return (
      <ProfilesPage
        machine={machine}
        onBack={() => setRoute({ page: "dashboard" })}
        onAction={onAction}
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
          rows={rows}
          isOnVPS={isOnVPS}
        />
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <SkeletonLoader cols={cols} rows={rows} />
        </Box>
      </Box>
    );
  }

  const panelFocusedSessions = cursorArea === "sessions" && focusColumn === "sessions";
  const panelFocusedDiary = cursorArea === "sessions" && focusColumn === "diary";
  const panelFocusedRepos = cursorArea === "sessions" && focusColumn === "repos";
  const panelFocusedTeam = cursorArea === "sessions" && focusColumn === "team";

  // --- Viewport-based column rendering ---
  const visibleColumns = availableColumns.slice(
    viewport.viewportStart,
    viewport.viewportStart + viewport.visibleFullCount,
  );

  // Left peek: column just before viewportStart
  const leftPeekColumn = viewport.hasLeftPeek ? availableColumns[viewport.viewportStart - 1] : null;
  // Right peek: column just after the last visible
  const rightPeekColumn = viewport.hasRightPeek
    ? availableColumns[viewport.viewportStart + viewport.visibleFullCount]
    : null;

  const renderColumn = (col: FocusColumn) => {
    switch (col) {
      case "sessions":
        return filteredMine.length > 0 ? (
          <SessionList
            key="sessions"
            sessions={filteredMine}
            repos={repos}
            selectedIndex={focusColumn === "sessions" ? sessionCursor : -1}
            selectable={panelFocusedSessions}
            focused={panelFocusedSessions}
            width={viewport.columnWidth}
            scrollOffset={focusColumn === "sessions" ? sessionScrollOffset : 0}
            maxVisible={maxVisible}
            selected={selected}
          />
        ) : (
          !searchActive && (
            <Box key="sessions" flexGrow={1} paddingY={1}>
              <EmptyState />
            </Box>
          )
        );
      case "diary":
        return (
          <DiaryColumn
            key="diary"
            latest3h={diary.latest3h}
            latestEod={diary.latestEod}
            focused={panelFocusedDiary}
            width={viewport.columnWidth}
            diaryCursor={diaryCursor}
            maxVisible={maxVisible}
          />
        );
      case "repos":
        return (
          <RepoList
            key="repos"
            repos={repos}
            sessions={sessions}
            selectedIndex={repoCursor}
            focused={panelFocusedRepos}
            width={viewport.columnWidth}
            scrollOffset={repoScrollOffset}
            maxVisible={maxVisible}
          />
        );
      case "team":
        return (
          <TeamSection
            key="team"
            sessions={filteredTeam}
            repos={repos}
            selectedIndex={focusColumn === "team" ? teamCursor : -1}
            selectable={panelFocusedTeam}
            focused={panelFocusedTeam}
            width={viewport.columnWidth}
            scrollOffset={focusColumn === "team" ? teamScrollOffset : 0}
            maxVisible={maxVisible}
          />
        );
    }
  };

  const sessionPanels =
    isEmpty && !showRepos ? (
      <Box flexGrow={1} paddingY={1}>
        <EmptyState />
      </Box>
    ) : (
      <Box flexDirection="row" flexGrow={1}>
        {leftPeekColumn && <PeekSliver label={COLUMN_LABELS[leftPeekColumn]} side="left" />}
        {visibleColumns.map(renderColumn)}
        {rightPeekColumn && <PeekSliver label={COLUMN_LABELS[rightPeekColumn]} side="right" />}
      </Box>
    );

  // Context-sensitive description
  let contextDescription: string | undefined;
  if (cursorArea === "sessions" && !searchActive) {
    if (
      focusColumn === "sessions" &&
      filteredMine.length > 0 &&
      sessionCursor < filteredMine.length
    ) {
      const s = filteredMine[sessionCursor];
      const attached = (s.attached_users || "").split(",").filter(Boolean);
      const others = attached.filter((u) => u !== npdevUser);
      const parts = [`Enter your session "${s.name}"`];
      if (others.length > 0) parts.push(`${others.join(", ")} online`);
      else if (parseInt(s.client_count || "0", 10) === 0)
        parts.push(`idle ${relativeTime(s.last_activity)}`);
      contextDescription = parts.join(" · ");
    } else if (
      focusColumn === "team" &&
      filteredTeam.length > 0 &&
      teamCursor < filteredTeam.length
    ) {
      const s = filteredTeam[teamCursor];
      const attached = (s.attached_users || "").split(",").filter(Boolean);
      const isActive = parseInt(s.client_count || "0", 10) > 0;
      const parts = [`Join ${s.owner}'s session "${s.name}"`];
      if (isActive && attached.length > 0) parts.push(`${attached.join(", ")} online`);
      else parts.push(`idle ${relativeTime(s.last_activity)}`);
      contextDescription = parts.join(" · ");
    } else if (focusColumn === "diary") {
      const diaryLabel = diaryCursor === 0 ? "3h Update" : "End-of-Day Summary";
      contextDescription = `${diaryLabel} · Enter to view full entry`;
    } else if (focusColumn === "repos" && repos.length > 0 && repoCursor < repos.length) {
      const repo = repos[repoCursor];
      const activeUsers = [
        ...new Set(
          sessions
            .filter(
              (s) => s.pane_cwd?.startsWith(repo.path) && parseInt(s.client_count || "0", 10) > 0,
            )
            .flatMap((s) => (s.attached_users || s.owner || "").split(",").filter(Boolean)),
        ),
      ];
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
        isOnVPS={isOnVPS}
      />
      <Box paddingX={1} paddingBottom={1}>
        <ButtonBar
          buttons={buttons}
          focusedIndex={focusedButton}
          isFocusZone={cursorArea === "actions" && !searchActive}
          contextDescription={
            cursorArea === "sessions" && !searchActive ? contextDescription : undefined
          }
          searchQuery={searchActive ? searchQuery : undefined}
          searchResultCount={searchResultCount}
        />
      </Box>
      {showStaleNudge && stale.length > 0 && <StaleNudge count={stale.length} />}
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
