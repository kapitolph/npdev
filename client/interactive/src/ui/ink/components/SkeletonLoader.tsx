import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

const GRADIENT = ["#313244", "#45475a", "#585b70", "#6c7086", "#585b70", "#45475a", "#313244"];
const BLOCK = "\u2588";

interface Props {
  cols: number;
  rows: number;
}

export function SkeletonLoader({ cols, rows }: Props) {
  const theme = useTheme();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % (GRADIENT.length * 3));
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const panelWidth = Math.floor((cols - 6) / 2);
  const barWidth = Math.max(8, panelWidth - 4);

  // Generate a shimmer bar with gradient sweep
  const shimmerBar = (width: number, offset: number) => {
    const chars: React.ReactNode[] = [];
    for (let i = 0; i < width; i++) {
      const gradIdx = (i + tick + offset) % (GRADIENT.length * 3);
      const colorIdx = gradIdx < GRADIENT.length ? gradIdx : 0;
      chars.push(
        <Text key={i} color={GRADIENT[colorIdx]}>
          {BLOCK}
        </Text>,
      );
    }
    return <Box>{chars}</Box>;
  };

  // Generate skeleton rows for a panel
  const skeletonPanel = (title: string, rowCount: number, offset: number) => (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={theme.surface2}
      paddingLeft={1}
    >
      <Box paddingBottom={1}>
        <Text color={theme.overlay0}>{title}</Text>
      </Box>
      {Array.from({ length: rowCount }).map((_, i) => (
        <Box key={i} flexDirection="column" paddingBottom={1}>
          {shimmerBar(Math.max(8, Math.floor(barWidth * (0.4 + (i % 3) * 0.2))), offset + i * 3)}
          {shimmerBar(Math.max(4, Math.floor(barWidth * 0.3)), offset + i * 3 + 5)}
        </Box>
      ))}
    </Box>
  );

  const skeletonRows = Math.min(3, Math.max(1, Math.floor((rows - 12) / 4)));

  return (
    <Box flexDirection="row" gap={2} flexGrow={1}>
      {skeletonPanel("Sessions", skeletonRows, 0)}
      {skeletonPanel("Repos", skeletonRows, 7)}
    </Box>
  );
}
