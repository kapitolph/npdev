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

export function TeamSection({
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

  // Group by owner
  const byOwner = new Map<string, SessionData[]>();
  for (const s of sessions) {
    if (!byOwner.has(s.owner)) byOwner.set(s.owner, []);
    byOwner.get(s.owner)!.push(s);
  }

  // Build flat list with owner labels
  const rows: { session: SessionData; ownerLabel?: string; flatIndex: number }[] = [];
  let flatIndex = 0;
  for (const [owner, ownerSessions] of byOwner) {
    for (let i = 0; i < ownerSessions.length; i++) {
      rows.push({
        session: ownerSessions[i],
        ownerLabel: i === 0 ? owner : "",
        flatIndex: flatIndex++,
      });
    }
  }

  const visibleRows = rows.slice(scrollOffset, scrollOffset + maxVisible);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, rows.length - scrollOffset - maxVisible);

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
        {" "}Team ({sessions.length})
      </Text>
      {aboveCount > 0 && (
        <Text color={theme.overlay1}> ↑ {aboveCount} more</Text>
      )}
      {visibleRows.map((row) => (
        <SessionRow
          key={row.session.name}
          session={row.session}
          isSelected={selectable && row.flatIndex === selectedIndex}
          showOwner
          ownerLabel={row.ownerLabel}
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
