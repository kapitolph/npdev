import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

export interface ButtonDef {
  key: string;
  label: string;
  action: () => void;
  highlight?: boolean;
  highlightColor?: string;
  active?: boolean;
  description?: string;
}

interface Props {
  buttons: ButtonDef[];
  focusedIndex: number;
  isFocusZone: boolean;
  contextDescription?: string;
  searchQuery?: string;
  searchResultCount?: number;
}

export function ButtonBar({
  buttons,
  focusedIndex,
  isFocusZone,
  contextDescription,
  searchQuery,
  searchResultCount,
}: Props) {
  const theme = useTheme();
  const isSearching = searchQuery != null;
  const focusedDesc = isFocusZone ? buttons[focusedIndex]?.description : contextDescription;

  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1} flexWrap="wrap">
        {buttons.map((btn, i) => {
          const isFocused = i === focusedIndex && isFocusZone;
          const tint = btn.active
            ? theme.green
            : btn.highlight
              ? btn.highlightColor || theme.yellow
              : undefined;
          const color = isFocused ? theme.accent : tint || theme.overlay0;
          const labelColor = isFocused ? theme.accent : tint || theme.subtext0;
          const borderColor = isFocused ? theme.accent : tint || theme.surface1;

          return (
            <Box key={btn.key} borderStyle="round" borderColor={borderColor} paddingX={1}>
              <Text color={color}>{btn.key}</Text>
              <Text color={labelColor}> {btn.label}</Text>
            </Box>
          );
        })}
      </Box>
      <Box paddingTop={1}>
        {isSearching ? (
          <>
            <Text color={theme.accent}>/ </Text>
            <Text color={theme.text}>{searchQuery}</Text>
            <Text color={theme.accent}>▎</Text>
            {searchResultCount != null && (
              <Text color={theme.overlay0}>
                {" "}
                — {searchResultCount} result{searchResultCount !== 1 ? "s" : ""}
              </Text>
            )}
          </>
        ) : (
          <Text color={theme.overlay0}>{focusedDesc || " "}</Text>
        )}
      </Box>
    </Box>
  );
}
