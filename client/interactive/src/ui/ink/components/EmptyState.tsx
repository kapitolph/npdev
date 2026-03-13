import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";
import { BRAND_BLUE } from "../theme";

export function EmptyState() {
  const theme = useTheme();

  return (
    <Box flexDirection="column" paddingX={4} paddingY={1}>
      <Text color={theme.overlay1}>No sessions yet.</Text>
      <Text> </Text>
      <Text color={theme.overlay1}>
        {"Press  "}
        <Text color={theme.accent} bold>
          n
        </Text>
        {"  to start your first session,"}
      </Text>
      <Text color={theme.overlay1}>or ask a teammate to share theirs.</Text>
      <Text> </Text>
      <Text color={BRAND_BLUE} dimColor>
        ❯❯ Ready when you are.
      </Text>
    </Box>
  );
}
