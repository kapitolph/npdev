import { Box, Text } from "ink";
import type { SummaryJsonlRecord } from "../../../types";
import { useTheme } from "../context/ThemeContext";

interface Props {
  latest3h: SummaryJsonlRecord | null;
  latestEod: SummaryJsonlRecord | null;
  focused: boolean;
  width: number;
  scrollOffset: number;
  maxVisible: number;
}

interface DiaryLine {
  type: "heading" | "subheading" | "body" | "spacer" | "divider";
  text: string;
}

function formatTimestamp(ts: string): string {
  // "2026-03-17 08:26" → "Mar 17, 08:26"
  const [date, time] = ts.split(" ");
  if (!date || !time) return ts;
  const [, month, day] = date.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months[parseInt(month, 10) - 1] || month;
  return `${m} ${parseInt(day, 10)}, ${time}`;
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function buildLines(
  entry: SummaryJsonlRecord | null,
  label: string,
  contentWidth: number,
): DiaryLine[] {
  if (!entry) {
    return [
      { type: "heading", text: label },
      { type: "body", text: "No entries yet" },
      { type: "spacer", text: "" },
    ];
  }

  const lines: DiaryLine[] = [];

  // Section header with timestamp
  lines.push({ type: "heading", text: label });
  lines.push({ type: "subheading", text: formatTimestamp(entry.timestamp) });
  lines.push({ type: "spacer", text: "" });

  // Signals — what happened
  lines.push({ type: "subheading", text: "Signals" });
  for (const l of wrapText(entry.signals, contentWidth)) {
    lines.push({ type: "body", text: l });
  }
  lines.push({ type: "spacer", text: "" });

  // What collaborators changed
  lines.push({ type: "subheading", text: "Collaborators" });
  for (const l of wrapText(entry.collaborators, contentWidth)) {
    lines.push({ type: "body", text: l });
  }
  lines.push({ type: "spacer", text: "" });

  // Current state
  lines.push({ type: "subheading", text: "State" });
  for (const l of wrapText(entry.state, contentWidth)) {
    lines.push({ type: "body", text: l });
  }
  lines.push({ type: "spacer", text: "" });

  return lines;
}

export function DiaryColumn({
  latest3h,
  latestEod,
  focused,
  width,
  scrollOffset,
  maxVisible,
}: Props) {
  const theme = useTheme();
  const contentWidth = Math.max(20, width - 6);

  // Build all renderable lines
  const allLines: DiaryLine[] = [
    ...buildLines(latest3h, "Latest 3h Update", contentWidth),
    { type: "divider", text: "" },
    { type: "spacer", text: "" },
    ...buildLines(latestEod, "End-of-Day Summary", contentWidth),
  ];

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + maxVisible);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, allLines.length - scrollOffset - maxVisible);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      backgroundColor={theme.panelBg}
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={focused ? theme.panelBorderFocused : theme.panelBorder}
      paddingLeft={1}
    >
      <Box paddingTop={1} paddingBottom={1}>
        <Text bold color={focused ? theme.accent : theme.overlay1}>Diary</Text>
      </Box>
      {aboveCount > 0 && <Text color={theme.overlay1}> {"\u2191"} {aboveCount} more</Text>}
      {visibleLines.map((line, i) => {
        switch (line.type) {
          case "heading":
            return (
              <Box key={`${scrollOffset + i}`} paddingBottom={0}>
                <Text bold color={theme.text} underline>
                  {line.text}
                </Text>
              </Box>
            );
          case "subheading":
            return (
              <Text key={`${scrollOffset + i}`} color={theme.lavender} bold>
                {line.text}
              </Text>
            );
          case "body":
            return (
              <Text key={`${scrollOffset + i}`} color={theme.subtext0} wrap="truncate">
                {line.text}
              </Text>
            );
          case "divider":
            return (
              <Text key={`${scrollOffset + i}`} color={theme.surface2}>
                {"─".repeat(Math.min(contentWidth, 40))}
              </Text>
            );
          case "spacer":
            return <Text key={`${scrollOffset + i}`}>{" "}</Text>;
        }
      })}
      {belowCount > 0 && <Text color={theme.overlay1}> {"\u2193"} {belowCount} more</Text>}
    </Box>
  );
}

/** Returns total scrollable line count for the diary content */
export function getDiaryLineCount(
  latest3h: SummaryJsonlRecord | null,
  latestEod: SummaryJsonlRecord | null,
  width: number,
): number {
  const contentWidth = Math.max(20, width - 6);
  const lines = [
    ...buildLines(latest3h, "Latest 3h Update", contentWidth),
    { type: "divider" as const, text: "" },
    { type: "spacer" as const, text: "" },
    ...buildLines(latestEod, "End-of-Day Summary", contentWidth),
  ];
  return lines.length;
}
