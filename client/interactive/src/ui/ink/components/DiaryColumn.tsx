import { Box, Text } from "ink";
import type { SummaryJsonlRecord } from "../../../types";
import { useTheme } from "../context/ThemeContext";

interface Props {
  latest3h: SummaryJsonlRecord | null;
  latestEod: SummaryJsonlRecord | null;
  focused: boolean;
  width: number;
  diaryCursor: number;
  maxVisible: number;
}

function formatTimestamp(ts: string): string {
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

/** Truncated preview of a diary entry inside a bordered box */
function DiaryBox({
  entry,
  title,
  active,
  focused,
  width,
  maxLines,
}: {
  entry: SummaryJsonlRecord | null;
  title: string;
  active: boolean;
  focused: boolean;
  width: number;
  maxLines: number;
}) {
  const theme = useTheme();
  const contentWidth = Math.max(10, width - 6);

  const borderColor = active && focused
    ? theme.accent
    : focused
      ? theme.panelBorder
      : theme.panelBorder;

  if (!entry) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        paddingLeft={1}
        paddingRight={1}
      >
        <Box paddingBottom={0}>
          <Text bold color={active && focused ? theme.accent : theme.overlay1}>{title}</Text>
        </Box>
        <Text color={theme.overlay0}>No entries yet</Text>
      </Box>
    );
  }

  // Build preview lines
  const previewLines: { text: string; color: string; bold?: boolean }[] = [];

  // Timestamp
  previewLines.push({ text: formatTimestamp(entry.timestamp), color: theme.lavender, bold: true });
  previewLines.push({ text: "", color: theme.text });

  // Signals section (truncated to fit)
  previewLines.push({ text: "Signals", color: theme.lavender, bold: true });
  for (const l of wrapText(entry.signals, contentWidth)) {
    previewLines.push({ text: l, color: theme.subtext0 });
  }

  // Truncate to maxLines
  const visible = previewLines.slice(0, maxLines);
  const remaining = Math.max(0, previewLines.length - maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      <Box paddingBottom={0}>
        <Text bold color={active && focused ? theme.accent : theme.overlay1}>{title}</Text>
      </Box>
      {visible.map((line, i) =>
        line.text === "" ? (
          <Text key={i}>{" "}</Text>
        ) : (
          <Text key={i} color={line.color} bold={line.bold} wrap="truncate">
            {line.text}
          </Text>
        ),
      )}
      {remaining > 0 && (
        <Text color={theme.overlay0}>{"\u2193"} {remaining} more</Text>
      )}
      {active && focused && (
        <Text color={theme.overlay0} dimColor>Enter to view</Text>
      )}
    </Box>
  );
}

export function DiaryColumn({
  latest3h,
  latestEod,
  focused,
  width,
  diaryCursor,
  maxVisible,
}: Props) {
  const theme = useTheme();

  // Split available vertical space between the two boxes
  // Reserve space for the column header (3 lines) and some padding
  const boxLines = Math.max(4, Math.floor((maxVisible - 2) / 2));

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
      <DiaryBox
        entry={latest3h}
        title="Latest 3h Update"
        active={diaryCursor === 0}
        focused={focused}
        width={width}
        maxLines={boxLines}
      />
      <Box paddingTop={1}>
        <DiaryBox
          entry={latestEod}
          title="End-of-Day Summary"
          active={diaryCursor === 1}
          focused={focused}
          width={width}
          maxLines={boxLines}
        />
      </Box>
    </Box>
  );
}

/** The diary column has exactly 2 selectable items */
export const DIARY_ITEM_COUNT = 2;
