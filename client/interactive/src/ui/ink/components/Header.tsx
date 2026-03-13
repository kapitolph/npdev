import { Box, Spacer, Text } from "ink";
import type { VersionInfo } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import type { Layout } from "../hooks/useTerminalSize";
import { Logo } from "./Logo";

interface Props {
  machineName: string;
  npdevUser: string;
  version: VersionInfo;
  cols: number;
  layout: Layout;
  isOnVPS: boolean;
}

export function Header({ machineName, npdevUser, version, cols, layout, isOnVPS }: Props) {
  const theme = useTheme();

  if (layout === "narrow") {
    return (
      <Box width={cols} backgroundColor={theme.highlight} paddingX={1}>
        <Logo layout={layout} isOnVPS={isOnVPS} />
        <Spacer />
        <Box gap={1}>
          <Text color={theme.subtext0}>{npdevUser}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box paddingX={1} paddingTop={1}>
        <Logo layout={layout} isOnVPS={isOnVPS} />
      </Box>
      <Box paddingX={1} gap={1} paddingTop={1}>
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
      </Box>
    </Box>
  );
}
