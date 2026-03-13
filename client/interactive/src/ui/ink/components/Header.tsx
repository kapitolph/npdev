import React from "react";
import { Box, Text, Spacer } from "ink";
import type { VersionInfo } from "../../../types";
import type { Layout } from "../hooks/useTerminalSize";
import { useTheme } from "../context/ThemeContext";
import { Logo } from "./Logo";

interface Props {
  machineName: string;
  npdevUser: string;
  version: VersionInfo;
  cols: number;
  layout: Layout;
}

export function Header({ machineName, npdevUser, version, cols, layout }: Props) {
  const theme = useTheme();

  if (layout === "narrow") {
    // Compact single-line header for narrow terminals
    return (
      <Box width={cols} backgroundColor={theme.surface0} paddingX={1}>
        <Box gap={1}>
          <Logo layout={layout} />
          <Text bold color={theme.text}>npdev</Text>
        </Box>
        <Spacer />
        <Box gap={1}>
          <Text color={theme.subtext0}>{npdevUser}</Text>
          <Text backgroundColor={theme.contextBadge.color} color={theme.base} bold>
            {" "}{theme.contextBadge.label}{" "}
          </Text>
        </Box>
      </Box>
    );
  }

  // Wide/normal: logo on top, info line below
  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingTop={1}>
        <Logo layout={layout} />
      </Box>
      <Box paddingX={1} gap={1}>
        <Text color={theme.subtext0}>npdev</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{machineName}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{npdevUser}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.overlay1}>v{version.current}</Text>
        {version.latest && (
          <Text backgroundColor={theme.yellow} color={theme.base} bold>
            {" ↑ "}
          </Text>
        )}
        <Text backgroundColor={theme.contextBadge.color} color={theme.base} bold>
          {" "}{theme.contextBadge.label}{" "}
        </Text>
      </Box>
    </Box>
  );
}
