import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import type { Layout } from "../hooks/useTerminalSize";
import { SessionRow } from "./SessionRow";

interface Props {
  sessions: SessionData[];
  selectedIndex: number;
  selectable: boolean;
  layout: Layout;
  width: number;
  scrollOffset: number;
  maxVisible: number;
  focused?: boolean;
}

export function SessionList({
  sessions,
  selectedIndex,
  selectable,
  layout,
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
      <Box paddingBottom={1}>
        <Text color={focused ? theme.accent : theme.overlay1}>Sessions</Text>
        <Text color={theme.overlay0}> ({sessions.length})</Text>
      </Box>
      {aboveCount > 0 && <Text color={theme.overlay1}> ↑ {aboveCount} more</Text>}
      {visibleSessions.map((s, i) => (
        <SessionRow
          key={s.name}
          session={s}
          isSelected={selectable && scrollOffset + i === selectedIndex}
          layout={layout}
          width={width}
        />
      ))}
      {belowCount > 0 && <Text color={theme.overlay1}> ↓ {belowCount} more</Text>}
    </Box>
  );
}
