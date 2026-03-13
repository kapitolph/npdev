import React from "react";
import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { SessionRow } from "./SessionRow";
import { theme } from "../theme";

interface Props {
  sessions: SessionData[];
  selectedIndex: number;
  selectable: boolean;
}

export function TeamSection({ sessions, selectedIndex, selectable }: Props) {
  if (sessions.length === 0) return null;

  // Group by owner
  const byOwner = new Map<string, SessionData[]>();
  for (const s of sessions) {
    if (!byOwner.has(s.owner)) byOwner.set(s.owner, []);
    byOwner.get(s.owner)!.push(s);
  }

  let flatIndex = 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selectable ? theme.borderFocused : theme.border}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={selectable ? theme.accent : theme.subtext1}>
          Team
        </Text>
        <Text color={theme.overlay0}> ({sessions.length})</Text>
      </Box>
      {Array.from(byOwner.entries()).map(([owner, ownerSessions]) =>
        ownerSessions.map((s, i) => {
          const idx = flatIndex++;
          return (
            <SessionRow
              key={s.name}
              session={s}
              isSelected={selectable && idx === selectedIndex}
              showOwner
              ownerLabel={i === 0 ? owner : ""}
            />
          );
        })
      )}
    </Box>
  );
}
