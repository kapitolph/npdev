import { Box, Text } from "ink";
import type { VersionInfo } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { Logo } from "./Logo";

interface Props {
  machineName: string;
  npdevUser: string;
  version: VersionInfo;
  cols: number;
  rows: number;
  isOnVPS: boolean;
}

export function Header({ machineName, npdevUser, version, cols, rows, isOnVPS }: Props) {
  const theme = useTheme();
  const compactLogo = rows < 30;

  // Determine update badge
  const isNightly = version.channel === "nightly";
  const hasStableUpdate = version.latest !== null;
  const hasNightlyUpdate = version.latestNightly !== null && !isNightly;

  return (
    <Box flexDirection="column" paddingBottom={compactLogo ? 0 : 1}>
      <Box paddingX={1} paddingTop={compactLogo ? 0 : 1}>
        <Logo isOnVPS={isOnVPS} compact={compactLogo} />
      </Box>
      <Box paddingX={1} gap={1} paddingTop={1}>
        <Text color={theme.subtext0}>npdev</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{machineName}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{npdevUser}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.overlay1}>v{version.current}</Text>
        {isNightly && (
          <Text backgroundColor={theme.lavender} color={theme.base} bold>
            {" nightly "}
          </Text>
        )}
        {hasStableUpdate && (
          <>
            <Text backgroundColor={theme.yellow} color={theme.base} bold>
              {" \u2191 "}
            </Text>
            <Text color={theme.yellow}> Update available</Text>
          </>
        )}
        {!hasStableUpdate && hasNightlyUpdate && (
          <>
            <Text backgroundColor={theme.lavender} color={theme.base} bold>
              {" \u2191 "}
            </Text>
            <Text color={theme.lavender}> Nightly available</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
