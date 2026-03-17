import { Box, Spacer, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { fetchRepoCommits, relativeTime } from "../../../lib/sessions";
import type { CommitData, Machine, RepoData, SessionData } from "../../../types";
import type { AppAction } from "../App";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { renderAsciiTextFit } from "../lib/asciiFont";
import { BRAND_BLUE, icons } from "../theme";

type DetailFocus = "sessions" | "commits";

interface Props {
  machine: Machine;
  repo: RepoData;
  sessions: SessionData[];
  onAction: (action: AppAction) => void;
  onBack: () => void;
  onNewSession: () => void;
}

export function RepoDetailPage({ machine, repo, sessions, onAction, onBack, onNewSession }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [sessionCursor, setSessionCursor] = useState(0);
  const [focus, setFocus] = useState<DetailFocus>("sessions");

  // Filter sessions for this repo
  const repoSessions = sessions.filter((s) => s.pane_cwd && s.pane_cwd.startsWith(repo.path));
  const activeSessions = repoSessions
    .filter((s) => parseInt(s.client_count || "0", 10) > 0)
    .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
  const inactiveSessions = repoSessions
    .filter((s) => parseInt(s.client_count || "0", 10) === 0)
    .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
  const allSessions = [...activeSessions, ...inactiveSessions];

  useEffect(() => {
    fetchRepoCommits(machine, repo.path).then(setCommits);
  }, [machine.host, repo.path]);

  const clampSession = useCallback(
    (c: number) => Math.max(0, Math.min(c, allSessions.length - 1)),
    [allSessions.length],
  );

  useEffect(() => {
    setSessionCursor((c) => clampSession(c));
  }, [clampSession]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "n") {
      onNewSession();
      return;
    }
    if (input === "o") {
      onAction({ type: "cd-to-repo", repoPath: repo.path });
      return;
    }

    // Left/Right: switch focus between sessions and commits panels
    if (key.leftArrow || key.rightArrow) {
      if (allSessions.length > 0 && commits.length > 0) {
        setFocus((f) => (f === "sessions" ? "commits" : "sessions"));
      }
      return;
    }
    if (key.tab) {
      if (allSessions.length > 0 && commits.length > 0) {
        setFocus((f) => (f === "sessions" ? "commits" : "sessions"));
      }
      return;
    }

    // Up/Down in sessions panel
    if (focus === "sessions" && allSessions.length > 0) {
      if (key.downArrow || input === "j") {
        setSessionCursor((c) => clampSession(c + 1));
        return;
      }
      if (key.upArrow || input === "k") {
        setSessionCursor((c) => clampSession(c - 1));
        return;
      }
      if (key.return && sessionCursor < allSessions.length) {
        const session = allSessions[sessionCursor];
        onAction({ type: "resume", sessionName: session.name });
        return;
      }
    }
  });

  const contentWidth = cols - 4;

  // ASCII art title
  const asciiLines = renderAsciiTextFit(repo.name, contentWidth);

  // Session panel content
  const sessionPanel = (focused: boolean) => (
    <Box
      flexDirection="column"
      flexGrow={1}
      backgroundColor={theme.panelBg}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={focused ? theme.panelBorderFocused : theme.panelBorder}
      paddingLeft={1}
    >
      <Box paddingTop={1} paddingBottom={1}>
        <Text bold color={focused ? theme.accent : theme.overlay1}>
          Sessions
        </Text>
        <Text color={theme.overlay0}> ({allSessions.length})</Text>
      </Box>
      {allSessions.length === 0 ? (
        <Text color={theme.overlay0}>No sessions in this repo</Text>
      ) : (
        <>
          {activeSessions.length > 0 && (
            <Box flexDirection="column" paddingBottom={1}>
              <Text color={theme.overlay0}>Active</Text>
              {activeSessions.map((s, i) => {
                const isSelected = focused && sessionCursor === i;
                const users = (s.attached_users || "").split(",").filter(Boolean);
                return (
                  <Box
                    key={s.name}
                    flexDirection="column"
                    backgroundColor={isSelected ? theme.highlight : undefined}
                  >
                    <Box>
                      <Text color={isSelected ? theme.cursor : undefined}>
                        {isSelected ? icons.cursor : " "}
                      </Text>
                      <Text> </Text>
                      <Text color={theme.sessionActive}>{icons.active}</Text>
                      <Text> </Text>
                      <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
                        {s.name}
                      </Text>
                      <Text
                        color={s.attached_users?.includes(s.owner) ? theme.green : theme.overlay1}
                      >
                        {" "}
                        {s.owner}
                      </Text>
                      <Spacer />
                      <Text color={theme.overlay1}>{relativeTime(s.last_activity)}</Text>
                      {users.length > 0 && (
                        <>
                          <Text> {icons.attached} </Text>
                          {users.map((u, j) => (
                            <Text key={u} color={u === s.owner ? theme.green : theme.lavender}>
                              {j > 0 ? ", " : ""}
                              {u}
                            </Text>
                          ))}
                        </>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
          {inactiveSessions.length > 0 && (
            <Box flexDirection="column">
              <Text color={theme.overlay0}>Inactive</Text>
              {inactiveSessions.map((s, i) => {
                const idx = activeSessions.length + i;
                const isSelected = focused && sessionCursor === idx;
                return (
                  <Box key={s.name} backgroundColor={isSelected ? theme.highlight : undefined}>
                    <Text color={isSelected ? theme.cursor : undefined}>
                      {isSelected ? icons.cursor : " "}
                    </Text>
                    <Text> </Text>
                    <Text color={theme.sessionIdle}>{icons.idle}</Text>
                    <Text> </Text>
                    <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
                      {s.name}
                    </Text>
                    <Text color={theme.overlay1}> {s.owner}</Text>
                    <Spacer />
                    <Text color={theme.overlay1}>{relativeTime(s.last_activity)}</Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </>
      )}
    </Box>
  );

  // Commits panel content
  const commitsPanel = (panelWidth: number, focused: boolean) => (
    <Box
      flexDirection="column"
      flexGrow={1}
      backgroundColor={theme.panelBg}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={focused ? theme.panelBorderFocused : theme.panelBorder}
      paddingLeft={1}
    >
      <Box paddingTop={1} paddingBottom={1}>
        <Text bold color={focused ? theme.accent : theme.overlay1}>
          Recent Commits
        </Text>
        <Text color={theme.overlay0}> ({commits.length})</Text>
      </Box>
      {commits.length === 0 ? (
        <Text color={theme.overlay0}>No commits found</Text>
      ) : (
        commits.slice(0, 12).map((c) => (
          <Box key={c.hash}>
            <Text color={theme.yellow}>{c.hash}</Text>
            <Text color={theme.overlay1}> {c.author}</Text>
            <Text color={theme.overlay0}> {c.date}</Text>
            <Text color={theme.text}> {c.subject.slice(0, Math.max(10, panelWidth - 35))}</Text>
          </Box>
        ))
      )}
    </Box>
  );

  const sessionsFocused = focus === "sessions";
  const commitsFocused = focus === "commits";

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      {/* ASCII art header */}
      <Box flexDirection="column" paddingX={2} paddingTop={1}>
        {asciiLines.map((line, i) => (
          <Text key={i} color={theme.accent}>
            {line}
          </Text>
        ))}
      </Box>

      {/* Branch info */}
      <Box paddingX={2} paddingBottom={1}>
        <Text color={theme.overlay1}>branch: </Text>
        <Text color={theme.green}>{repo.branch}</Text>
        <Text color={theme.overlay0}>
          {" "}
          {icons.bullet} {repo.path}
        </Text>
      </Box>

      {/* Two-column layout: Sessions | Commits */}
      <Box flexDirection="row" gap={2} flexGrow={1} paddingX={1}>
        {sessionPanel(sessionsFocused)}
        {commitsPanel(Math.floor(contentWidth / 2) - 2, commitsFocused)}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          <Text color={BRAND_BLUE}>n</Text> new session <Text color={BRAND_BLUE}>o</Text> open shell{" "}
          <Text color={BRAND_BLUE}>{"\u21B5"}</Text> join{" "}
          <Text color={BRAND_BLUE}>{"\u2190\u2192"}</Text> panels{" "}
          <Text color={BRAND_BLUE}>esc</Text> back
        </Text>
      </Box>
    </Box>
  );
}
