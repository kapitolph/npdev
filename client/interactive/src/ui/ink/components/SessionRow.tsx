import { Box, Spacer, Text } from "ink";
import { activityAge, relativeTime } from "../../../lib/sessions";
import type { SessionData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import type { Layout } from "../hooks/useTerminalSize";
import { icons } from "../theme";

interface Props {
  session: SessionData;
  isSelected: boolean;
  showOwner?: boolean;
  ownerLabel?: string;
  layout: Layout;
  width: number;
}

export function SessionRow({ session, isSelected, showOwner, ownerLabel, layout, width }: Props) {
  const theme = useTheme();
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

  const displayName = layout === "narrow" ? session.name.slice(0, 16) : session.name;

  const hasDescription =
    session.description &&
    session.description !== "(no description)" &&
    !isActive &&
    layout !== "narrow";

  return (
    <Box
      flexDirection="column"
      width={width}
      backgroundColor={isSelected ? theme.surface0 : undefined}
    >
      {/* Line 1 */}
      <Box>
        <Text color={isSelected ? theme.cursor : undefined}>{isSelected ? icons.cursor : " "}</Text>
        <Text> </Text>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text> </Text>
        <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
          {displayName}
        </Text>
        {showOwner && ownerLabel !== undefined && <Text color={theme.overlay1}> {ownerLabel}</Text>}
        <Spacer />
        <Text color={isStale ? theme.yellow : theme.overlay1}>
          {relativeTime(session.last_activity)}
        </Text>
        {isActive && (
          <Text color={theme.green}>
            {" "}
            {icons.attached} {session.attached_users || String(count)}
          </Text>
        )}
      </Box>
      {/* Line 2: description */}
      {hasDescription && (
        <Box paddingLeft={4}>
          <Text color={theme.overlay0} wrap="truncate">
            {session.description.slice(0, Math.max(20, width - 8))}
          </Text>
        </Box>
      )}
    </Box>
  );
}
