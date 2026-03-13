import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

interface Props {
  label: string;
  value: string;
  error?: string;
  hint?: string;
}

export function TextInput({ label, value, error, hint }: Props) {
  const theme = useTheme();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={error ? theme.red : theme.accent}
      paddingX={1}
    >
      <Box gap={1}>
        <Text color={theme.accent}>{label}</Text>
        <Text color={theme.text}>{value}</Text>
        <Text color={theme.overlay0}>▌</Text>
      </Box>
      {error && <Text color={theme.red}>✗ {error}</Text>}
      {!error && hint && <Text color={theme.overlay1}>{hint}</Text>}
    </Box>
  );
}
