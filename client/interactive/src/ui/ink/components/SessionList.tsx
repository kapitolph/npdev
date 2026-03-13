import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import type { Layout } from "../hooks/useTerminalSize";
import { toBlockText } from "../theme";
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

  const headerText = `Sessions (${sessions.length})`;
  const blockLines = layout !== "narrow" ? toBlockText(headerText) : null;

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
      {blockLines ? (
        <Box flexDirection="column" paddingBottom={1}>
          <Text color={focused ? theme.accent : theme.overlay1}>{blockLines[0]}</Text>
          <Text color={focused ? theme.accent : theme.overlay1}>{blockLines[1]}</Text>
        </Box>
      ) : (
        <Text color={focused ? theme.accent : theme.overlay1} bold={focused}>
          Your sessions ({sessions.length})
        </Text>
      )}
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
