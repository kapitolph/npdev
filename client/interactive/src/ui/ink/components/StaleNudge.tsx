import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";
import { icons } from "../theme";

interface Props {
  count: number;
}

export function StaleNudge({ count }: Props) {
  const theme = useTheme();

  return (
    <Box paddingX={2}>
      <Text color={theme.yellow}>
        {icons.warning} You have {count} stale session{count > 1 ? "s" : ""}
      </Text>
      <Text color={theme.overlay1}> — </Text>
      <Text color={theme.accent} bold>
        c
      </Text>
      <Text color={theme.overlay1}> clean all · </Text>
      <Text color={theme.accent} bold>
        space
      </Text>
      <Text color={theme.overlay1}> select</Text>
    </Box>
  );
}
