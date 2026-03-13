import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface Action {
  key: string;
  label: string;
  hidden?: boolean;
}

interface Props {
  actions: Action[];
}

export function ActionBar({ actions }: Props) {
  const visible = actions.filter((a) => !a.hidden);

  return (
    <Box paddingX={1} gap={1} flexWrap="wrap">
      {visible.map((action, i) => (
        <Box key={action.key} gap={0}>
          <Text color={theme.mauve} bold>[{action.key}]</Text>
          <Text color={theme.subtext0}> {action.label}</Text>
          {i < visible.length - 1 && <Text color={theme.overlay0}>  </Text>}
        </Box>
      ))}
    </Box>
  );
}
