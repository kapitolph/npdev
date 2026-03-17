import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../context/ThemeContext";

type FocusColumn = "sessions" | "repos" | "team";

interface Props {
  mode: string;
  focusColumn: FocusColumn;
  staleCount: number;
  sessionCount: number;
  confirmEndName?: string;
  confirmBulkNames?: string[];
  selectionCount?: number;
  cols: number;
}

export function StatusLine({
  mode,
  focusColumn,
  staleCount,
  sessionCount,
  confirmEndName,
  confirmBulkNames,
  selectionCount = 0,
  cols,
}: Props) {
  const theme = useTheme();

  let content: React.ReactNode;

  if (confirmBulkNames && confirmBulkNames.length > 0) {
    const nameList = confirmBulkNames.join(", ");
    const shortEnough = nameList.length < cols - 30;
    const label = shortEnough
      ? `Kill ${confirmBulkNames.length} session${confirmBulkNames.length > 1 ? "s" : ""} (${nameList})?`
      : `Kill ${confirmBulkNames.length} session${confirmBulkNames.length > 1 ? "s" : ""}?`;
    content = (
      <Text>
        <Text color={theme.yellow}>{label} </Text>
        <Text color={theme.accent} bold>
          [y]
        </Text>
        <Text color={theme.subtext0}> yes </Text>
        <Text color={theme.accent} bold>
          [n]
        </Text>
        <Text color={theme.subtext0}> no</Text>
      </Text>
    );
  } else if (confirmEndName) {
    content = (
      <Text>
        <Text color={theme.yellow}>Kill '{confirmEndName}'? </Text>
        <Text color={theme.accent} bold>
          [y]
        </Text>
        <Text color={theme.subtext0}> yes </Text>
        <Text color={theme.accent} bold>
          [n]
        </Text>
        <Text color={theme.subtext0}> no</Text>
      </Text>
    );
  } else if (mode === "new-session") {
    content = <Text color={theme.overlay1}>Enter to confirm · Esc to cancel</Text>;
  } else if (focusColumn === "repos") {
    content = (
      <Text color={theme.overlay1}>
        {"\u2191\u2193"} navigate · {"\u21B5"} details · tab cycle
      </Text>
    );
  } else if (focusColumn === "team") {
    content = <Text color={theme.overlay1}>Viewing team sessions · tab to cycle</Text>;
  } else if (selectionCount > 0) {
    content = (
      <Text>
        <Text color={theme.yellow}>{selectionCount} selected</Text>
        <Text color={theme.overlay1}> · </Text>
        <Text color={theme.accent}>k</Text>
        <Text color={theme.overlay1}> kill · </Text>
        <Text color={theme.accent}>esc</Text>
        <Text color={theme.overlay1}> clear</Text>
      </Text>
    );
  } else if (staleCount > 0) {
    content = (
      <Text>
        <Text color={theme.yellow}>
          {"\u26A0"} {staleCount} stale session{staleCount > 1 ? "s" : ""}
        </Text>
        <Text color={theme.overlay1}> · </Text>
        <Text color={theme.accent}>c</Text>
        <Text color={theme.overlay1}> to clean</Text>
      </Text>
    );
  } else {
    content = (
      <Text color={theme.overlay1}>
        {sessionCount > 0
          ? `\u2191\u2193 navigate · \u2190\u2192 panels · \u21B5 select · k kill`
          : `n new session · q quit`}
      </Text>
    );
  }

  return (
    <Box width={cols} paddingX={1}>
      {content}
    </Box>
  );
}
