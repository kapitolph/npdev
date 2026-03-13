import React from "react";
import { Box, Text } from "ink";
import type { VersionInfo } from "../../../types";
import { theme, icons } from "../theme";
import { Logo } from "./Logo";

interface Props {
  machineName: string;
  npdevUser: string;
  version: VersionInfo;
}

export function Header({ machineName, npdevUser, version }: Props) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        <Logo />
        <Text color={theme.overlay0}>{icons.separator}</Text>
        <Text bold color={theme.mauve}>npdev</Text>
        <Text color={theme.overlay0}>{icons.separator}</Text>
        <Text bold color={theme.text}>{machineName}</Text>
        <Text color={theme.overlay0}>{icons.separator}</Text>
        <Text color={theme.subtext0}>{npdevUser}</Text>
        <Text color={theme.overlay0}>{icons.separator}</Text>
        <Text color={theme.overlay1}>v{version.current}</Text>
        {version.latest && (
          <>
            <Text color={theme.overlay0}>{icons.separator}</Text>
            <Text color={theme.yellow}>↑ v{version.latest} available</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

