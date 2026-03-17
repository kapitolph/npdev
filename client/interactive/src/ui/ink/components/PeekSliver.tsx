import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";
import { PEEK_WIDTH } from "../hooks/useViewport";

interface Props {
  /** Header label of the peeked column (e.g. "Sessions", "Repos", "Team") */
  label: string;
  side: "left" | "right";
}

export function PeekSliver({ label, side }: Props) {
  const theme = useTheme();
  const truncated = label.slice(0, PEEK_WIDTH - 2);

  return (
    <Box
      flexDirection="column"
      width={PEEK_WIDTH}
      borderStyle="single"
      borderLeft={side === "left"}
      borderRight={side === "right"}
      borderTop={false}
      borderBottom={false}
      borderColor={theme.surface2}
    >
      <Box paddingTop={1}>
        <Text color={theme.overlay0} dimColor>
          {truncated}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.overlay0} dimColor>
          {"░".repeat(PEEK_WIDTH - 2)}
        </Text>
      </Box>
    </Box>
  );
}
