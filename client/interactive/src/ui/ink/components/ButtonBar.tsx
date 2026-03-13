import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

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
    <Box gap={1} flexWrap="wrap">
      {buttons.map((btn, i) => {
        const isFocused = i === focusedIndex && isFocusZone;

        return (
          <Box
            key={btn.key}
            borderStyle="round"
            borderColor={isFocused ? theme.accent : theme.surface1}
            paddingX={1}
          >
            <Text color={isFocused ? theme.accent : theme.overlay0}>{btn.key}</Text>
            <Text color={isFocused ? theme.accent : theme.subtext0}> {btn.label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
