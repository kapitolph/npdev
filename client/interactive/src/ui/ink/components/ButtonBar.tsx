import React from "react";
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

  const borderColor = isFocusZone ? theme.panelBorderFocused : theme.panelBorder;

  return (
    <Box
      paddingLeft={1}
      gap={2}
      flexWrap="wrap"
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={borderColor}
    >
      {buttons.map((btn, i) => {
        const isFocused = i === focusedIndex && isFocusZone;

        return (
          <Box key={btn.key}>
            <Text color={theme.overlay0}>{btn.key}</Text>
            <Text> </Text>
            <Text
              color={isFocused ? theme.accent : theme.subtext0}
              bold={isFocused}
            >
              {isFocused ? `▸ ${toBold(btn.label.toUpperCase())}` : toBold(btn.label.toUpperCase())}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
