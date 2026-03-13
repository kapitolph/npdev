import React from "react";
import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import type { Layout } from "../hooks/useTerminalSize";
import { SessionRow } from "./SessionRow";
import { useTheme } from "../context/ThemeContext";

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
  if (sessions.length === 0) return null;

  const theme = useTheme();
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
    >
      <Text color={focused ? theme.accent : theme.overlay1} bold={focused}>
        {" "}Your sessions ({sessions.length})
      </Text>
      {aboveCount > 0 && (
        <Text color={theme.overlay1}> ↑ {aboveCount} more</Text>
      )}
      {visibleSessions.map((s, i) => (
        <SessionRow
          key={s.name}
          session={s}
          isSelected={selectable && scrollOffset + i === selectedIndex}
          layout={layout}
          width={width}
        />
      ))}
      {belowCount > 0 && (
        <Text color={theme.overlay1}> ↓ {belowCount} more</Text>
      )}
    </Box>
  );
}
