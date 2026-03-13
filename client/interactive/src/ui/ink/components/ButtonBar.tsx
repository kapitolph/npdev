import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";
import { toBold } from "../theme";

export interface ButtonDef {
  key: string;
  label: string;
  action: () => void;
}

interface Props {
  buttons: ButtonDef[];
  focusedIndex: number;
  isFocusZone: boolean;
}

export function ButtonBar({ buttons, focusedIndex, isFocusZone }: Props) {
  const theme = useTheme();

  return (
    <Box flexDirection="column">
      {buttons.map((btn, i) => {
        const isFocused = i === focusedIndex && isFocusZone;

        return (
          <Box key={btn.key}>
            <Text color={isFocused ? theme.accent : theme.surface2}>{isFocused ? "▸" : " "}</Text>
            <Text> </Text>
            <Box
              borderStyle="round"
              borderColor={isFocused ? theme.accent : theme.surface1}
              paddingX={1}
            >
              <Text color={isFocused ? theme.accent : theme.overlay0}>{btn.key}</Text>
              <Text color={isFocused ? theme.accent : theme.subtext0}>
                {" "}
                {toBold(btn.label.toUpperCase())}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
