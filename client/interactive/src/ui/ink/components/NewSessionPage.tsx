import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

interface Props {
  onSubmit: (name: string) => void;
  onBack: () => void;
}

export function NewSessionPage({ onSubmit, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      const name = value.trim();
      if (!name) {
        setError("Name required");
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        setError("Only letters, numbers, hyphens, underscores");
        return;
      }
      onSubmit(name);
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setError("");
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input);
      setError("");
    }
  });

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      {/* Top spacer */}
      <Box flexGrow={1} />

      {/* Center content */}
      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          NEW SESSION
        </Text>
        <Text> </Text>

        {/* Input area */}
        <Box
          flexDirection="column"
          width={Math.min(50, cols - 4)}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={error ? theme.red : theme.accent}
          paddingX={2}
          paddingY={1}
        >
          <Text color={theme.overlay1}>Session name</Text>
          <Box>
            <Text color={theme.text}>{value}</Text>
            <Text color={theme.accent}>▌</Text>
          </Box>
          {error ? (
            <Box paddingTop={1}>
              <Text color={theme.red}>✗ {error}</Text>
            </Box>
          ) : (
            <Box paddingTop={1}>
              <Text color={theme.overlay0}>Letters, numbers, hyphens, underscores</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Bottom spacer */}
      <Box flexGrow={1} />

      {/* Footer */}
      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          <Text color={BRAND_BLUE}>↵</Text> create · <Text color={BRAND_BLUE}>esc</Text> back
        </Text>
      </Box>
    </Box>
  );
}
