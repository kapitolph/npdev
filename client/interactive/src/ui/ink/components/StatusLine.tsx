import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

interface Props {
  mode: string;
  activePanel: "mine" | "team";
  staleCount: number;
  sessionCount: number;
  confirmStale?: boolean;
  confirmEndName?: string;
  cols: number;
}

export function StatusLine({
  mode,
  activePanel,
  staleCount,
  sessionCount,
  confirmStale,
  confirmEndName,
  cols,
}: Props) {
  const theme = useTheme();

  let content: React.ReactNode;

  if (confirmEndName) {
    content = (
      <Text>
        <Text color={theme.yellow}>
          End '{confirmEndName}'?{" "}
        </Text>
        <Text color={theme.accent} bold>[y]</Text>
        <Text color={theme.subtext0}> yes  </Text>
        <Text color={theme.accent} bold>[n]</Text>
        <Text color={theme.subtext0}> no</Text>
      </Text>
    );
  } else if (confirmStale) {
    content = (
      <Text>
        <Text color={theme.yellow}>
          End {staleCount} stale session{staleCount > 1 ? "s" : ""}?{" "}
        </Text>
        <Text color={theme.accent} bold>[y]</Text>
        <Text color={theme.subtext0}> yes  </Text>
        <Text color={theme.accent} bold>[n]</Text>
        <Text color={theme.subtext0}> no</Text>
      </Text>
    );
  } else if (mode === "new-session") {
    content = (
      <Text color={theme.overlay1}>Enter to confirm · Esc to cancel</Text>
    );
  } else if (activePanel === "team") {
    content = (
      <Text color={theme.overlay1}>Viewing team sessions · <Text color={theme.accent}>t</Text> to switch back</Text>
    );
  } else if (staleCount > 0) {
    content = (
      <Text>
        <Text color={theme.yellow}>⚠ {staleCount} stale session{staleCount > 1 ? "s" : ""}</Text>
        <Text color={theme.overlay1}> · </Text>
        <Text color={theme.accent}>c</Text>
        <Text color={theme.overlay1}> to clean</Text>
      </Text>
    );
  } else {
    content = (
      <Text color={theme.overlay1}>
        {sessionCount > 0
          ? `↑↓ navigate · ←→ panels · ↵ select · d end`
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
