import { Box, Text } from "ink";
import type { RepoData, SessionData } from "../../../types";
import { sessionsForRepo } from "../../../lib/sessions";
import { useTheme } from "../context/ThemeContext";

interface Props {
  repos: RepoData[];
  sessions: SessionData[];
  selectedIndex: number;
  focused: boolean;
  width: number;
  scrollOffset: number;
  maxVisible: number;
}

export function RepoList({
  repos,
  sessions,
  selectedIndex,
  focused,
  width,
  scrollOffset,
  maxVisible,
}: Props) {
  const theme = useTheme();
  if (repos.length === 0) return null;

  const visibleRepos = repos.slice(scrollOffset, scrollOffset + maxVisible);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, repos.length - scrollOffset - maxVisible);

  return (
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
        <Text bold color={focused ? theme.accent : theme.overlay1}>Repos</Text>
        <Text color={theme.overlay0}> ({repos.length})</Text>
      </Box>
      {aboveCount > 0 && <Text color={theme.overlay1}> {"\u2191"} {aboveCount} more</Text>}
      {visibleRepos.map((repo, i) => {
        const isSelected = focused && scrollOffset + i === selectedIndex;
        const activeUsers = sessionsForRepo(sessions, repos, repo.path)
          .filter(s => parseInt(s.client_count || "0", 10) > 0)
          .flatMap(s => (s.attached_users || s.owner || "").split(",").filter(Boolean));
        const uniqueUsers = [...new Set(activeUsers)];
        const hasActive = uniqueUsers.length > 0;

        return (
          <Box
            key={repo.path}
            flexDirection="column"
            width={width - 2}
            backgroundColor={isSelected ? theme.highlight : undefined}
          >
            <Box>
              <Text color={isSelected ? theme.cursor : undefined}>
                {isSelected ? "▸" : " "}
              </Text>
              <Text> </Text>
              <Text color={hasActive ? theme.green : theme.overlay1}>
                {hasActive ? "●" : "○"}
              </Text>
              <Text> </Text>
              <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
                {repo.name}
              </Text>
            </Box>
            <Box paddingLeft={4}>
              <Text color={theme.overlay0} wrap="truncate">
                {hasActive ? uniqueUsers.join(", ") : repo.branch || ""}
              </Text>
            </Box>
          </Box>
        );
      })}
      {belowCount > 0 && <Text color={theme.overlay1}> {"\u2193"} {belowCount} more</Text>}
    </Box>
  );
}
