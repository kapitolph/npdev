import React from "react";
import { Box, Text } from "ink";
import type { SessionData } from "../../../types";
import { relativeTime, activityAge } from "../../../lib/sessions";
import { theme, icons } from "../theme";

interface Props {
  session: SessionData;
  isSelected: boolean;
  showOwner?: boolean;
  ownerLabel?: string;
}

export function SessionRow({ session, isSelected, showOwner, ownerLabel }: Props) {
  const count = parseInt(session.client_count || "0", 10);
  const age = activityAge(session.last_activity);
  const isStale = age > 3 * 86400;
  const isActive = count > 0;

  const statusColor = isActive
    ? theme.sessionActive
    : isStale
      ? theme.sessionStale
      : theme.sessionIdle;

  const statusIcon = isActive ? icons.active : isStale ? icons.stale : icons.idle;

  return (
    <Box gap={1}>
      <Text color={isSelected ? theme.cursor : undefined}>
        {isSelected ? icons.cursor : " "}
      </Text>
      <Text color={statusColor}>{statusIcon}</Text>
      <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
        {session.name.padEnd(22)}
      </Text>
      {showOwner && ownerLabel !== undefined && (
        <Text color={theme.overlay1}>{(ownerLabel || "").padEnd(10)}</Text>
      )}
      <Text color={isStale ? theme.yellow : theme.overlay1}>
        {relativeTime(session.last_activity).padEnd(10)}
      </Text>
      {isActive && (
        <Text color={theme.green}>{count} attached</Text>
      )}
      {session.description && session.description !== "(no description)" && !isActive && (
        <Text color={theme.overlay0} wrap="truncate">
          {session.description.slice(0, 40)}
        </Text>
      )}
    </Box>
  );
}
