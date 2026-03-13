import React from "react";
import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { SessionRow } from "./SessionRow";
import { theme } from "../theme";

interface Props {
  title: string;
  sessions: SessionData[];
  selectedIndex: number;
  selectable: boolean;
}

export function SessionList({ title, sessions, selectedIndex, selectable }: Props) {
  if (sessions.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selectable ? theme.borderFocused : theme.border}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={selectable ? theme.accent : theme.subtext1}>
          {title}
        </Text>
        <Text color={theme.overlay0}> ({sessions.length})</Text>
      </Box>
      {sessions.map((s, i) => (
        <SessionRow
          key={s.name}
          session={s}
          isSelected={selectable && i === selectedIndex}
        />
      ))}
    </Box>
  );
}
