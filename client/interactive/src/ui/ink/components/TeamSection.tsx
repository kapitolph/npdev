import { Box, Text } from "ink";
import { deriveRepoName } from "../../../lib/sessions";
import type { RepoData, SessionData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { SessionRow } from "./SessionRow";

interface Props {
  sessions: SessionData[];
  repos: RepoData[];
  selectedIndex: number;
  selectable: boolean;
  width: number;
  scrollOffset: number;
  maxVisible: number;
  focused?: boolean;
}

export function TeamSection({
  sessions,
  repos,
  selectedIndex,
  selectable,
  width,
  scrollOffset,
  maxVisible,
  focused = false,
}: Props) {
  const theme = useTheme();
  if (sessions.length === 0) return null;

  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + maxVisible);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, sessions.length - scrollOffset - maxVisible);

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
        <Text bold color={focused ? theme.accent : theme.overlay1}>
          Team
        </Text>
        <Text color={theme.overlay0}> ({sessions.length})</Text>
      </Box>
      {aboveCount > 0 && <Text color={theme.overlay1}> ↑ {aboveCount} more</Text>}
      {visibleSessions.map((s, i) => (
        <SessionRow
          key={s.name}
          session={s}
          isSelected={selectable && scrollOffset + i === selectedIndex}
          showOwner
          ownerLabel={s.owner}
          repoName={deriveRepoName(s, repos)}
          width={width}
        />
      ))}
      {belowCount > 0 && <Text color={theme.overlay1}> ↓ {belowCount} more</Text>}
    </Box>
  );
}
