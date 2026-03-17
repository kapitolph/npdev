import { Box, Spacer, Text } from "ink";
import { businessDaysElapsed, relativeTime, STALE_BUSINESS_DAYS } from "../../../lib/sessions";
import type { SessionData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { icons } from "../theme";

interface Props {
  session: SessionData;
  isSelected: boolean;
  isMarked?: boolean;
  showOwner?: boolean;
  ownerLabel?: string;
  repoName?: string;
  width: number;
}

export function SessionRow({
  session,
  isSelected,
  isMarked,
  showOwner,
  ownerLabel,
  repoName,
  width,
}: Props) {
  const theme = useTheme();
  const count = parseInt(session.client_count || "0", 10);
  const isStale = businessDaysElapsed(session.last_activity) > STALE_BUSINESS_DAYS;
  const isActive = count > 0;

  const statusColor = isActive
    ? theme.sessionActive
    : isStale
      ? theme.sessionStale
      : theme.sessionIdle;

  const statusIcon = isActive ? icons.active : isStale ? icons.stale : icons.idle;

  const hasDescription =
    session.description && session.description !== "(no description)" && !isActive;

  const ownerIsAttached =
    isActive && (session.attached_users || "").split(",").includes(session.owner);

  return (
    <Box
      flexDirection="column"
      width={width}
      backgroundColor={isSelected ? theme.highlight : undefined}
    >
      {/* Line 1 */}
      <Box>
        <Text color={isMarked ? theme.green : isSelected ? theme.cursor : undefined}>
          {isMarked ? "✓" : isSelected ? icons.cursor : " "}
        </Text>
        <Text> </Text>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text> </Text>
        <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
          {session.name}
        </Text>
        {showOwner && ownerLabel && (
          <Text color={ownerIsAttached ? theme.green : theme.overlay1}> {ownerLabel}</Text>
        )}
        <Spacer />
        <Text color={isStale ? theme.yellow : theme.overlay1}>
          {relativeTime(session.last_activity)}
        </Text>
        {isActive &&
          (() => {
            const users = (session.attached_users || "").split(",").filter(Boolean);
            return (
              <>
                <Text> {icons.attached} </Text>
                {users.length > 0 ? (
                  users.map((u, i) => (
                    <Text key={u} color={u === session.owner ? theme.green : theme.lavender}>
                      {i > 0 ? ", " : ""}
                      {u}
                    </Text>
                  ))
                ) : (
                  <Text color={theme.green}>{String(count)}</Text>
                )}
              </>
            );
          })()}
      </Box>
      {/* Line 2: repo + description */}
      <Box paddingLeft={4}>
        <Text color={theme.overlay0} wrap="truncate">
          {repoName || "No project"}
          {hasDescription
            ? ` ${icons.bullet} ${session.description.slice(0, Math.max(20, width - 8 - (repoName || "No project").length))}`
            : ""}
        </Text>
      </Box>
    </Box>
  );
}
