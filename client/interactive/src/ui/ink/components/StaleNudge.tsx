import React from "react";
import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { theme, icons } from "../theme";

interface Props {
  sessions: SessionData[];
}

export function StaleNudge({ sessions }: Props) {
  if (sessions.length === 0) return null;

  const names = sessions.map((s) => s.name).join(", ");

  return (
    <Box paddingX={1} gap={1}>
      <Text color={theme.yellow}>{icons.warning}</Text>
      <Text color={theme.yellow}>
        {sessions.length} stale session{sessions.length > 1 ? "s" : ""} (3+ days idle): {names}
      </Text>
      <Text color={theme.overlay1}>— press </Text>
      <Text color={theme.mauve} bold>c</Text>
      <Text color={theme.overlay1}> to clean up</Text>
    </Box>
  );
}
