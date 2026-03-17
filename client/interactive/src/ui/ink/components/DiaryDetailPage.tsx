import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { fetchDiaryEntries } from "../../../lib/diary";
import type { Machine, SummaryJsonlRecord } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

type DiaryType = "3h" | "eod";

interface Props {
  machine: Machine;
  type: DiaryType;
  initialEntry: SummaryJsonlRecord | null;
  onBack: () => void;
}

interface SectionLine {
  type: "title" | "heading" | "body" | "spacer";
  text: string;
}

function formatTimestamp(ts: string): string {
  const [date, time] = ts.split(" ");
  if (!date || !time) return ts;
  const [year, month, day] = date.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const m = months[parseInt(month, 10) - 1] || month;
  return `${m} ${parseInt(day, 10)}, ${year} ${time}`;
}

function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
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
  }
  return lines;
}

function buildEntryLines(entry: SummaryJsonlRecord, contentWidth: number): SectionLine[] {
  const lines: SectionLine[] = [];

  const sections: { heading: string; content: string }[] = [
    { heading: "What happened", content: entry.happened },
    { heading: "What changed in me", content: entry.changed },
    { heading: "Where I am now", content: entry.state },
    { heading: "Where this leads", content: entry.leads },
    { heading: "Open threads", content: entry.threads },
  ];

  for (const section of sections) {
    lines.push({ type: "heading", text: section.heading });
    for (const l of wrapText(section.content, contentWidth)) {
      lines.push({ type: l === "" ? "spacer" : "body", text: l });
    }
    lines.push({ type: "spacer", text: "" });
  }

  return lines;
}

export function DiaryDetailPage({ machine, type, initialEntry, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const [entries, setEntries] = useState<SummaryJsonlRecord[]>(initialEntry ? [initialEntry] : []);
  const [entryIndex, setEntryIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Load all entries for navigation
  useEffect(() => {
    fetchDiaryEntries(machine, type).then((all) => {
      if (all.length > 0) {
        setEntries(all);
      }
      setLoaded(true);
    });
  }, [machine.host, type]);

  const entry = entries[entryIndex] || null;
  const title = type === "3h" ? "3h Update" : "End-of-Day Summary";
  const contentWidth = Math.max(20, cols - 8);

  // Build scrollable lines for current entry
  const entryLines = entry ? buildEntryLines(entry, contentWidth) : [];
  const headerHeight = 6; // title + timestamp + position + spacer + divider
  const footerHeight = 2;
  const maxBodyLines = Math.max(2, rows - headerHeight - footerHeight);

  const navigate = useCallback(
    (delta: number) => {
      setEntryIndex((prev) => {
        const next = Math.max(0, Math.min(prev + delta, entries.length - 1));
        if (next !== prev) setScrollOffset(0);
        return next;
      });
    },
    [entries.length],
  );

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }

    // Navigate between entries
    if (key.leftArrow || input === "h") {
      navigate(1); // older (higher index = older since reversed)
      return;
    }
    if (key.rightArrow || input === "l") {
      navigate(-1); // newer
      return;
    }

    // Scroll within entry
    if (key.downArrow || input === "j") {
      const maxScroll = Math.max(0, entryLines.length - maxBodyLines);
      setScrollOffset((prev) => Math.min(prev + 1, maxScroll));
      return;
    }
    if (key.upArrow || input === "k") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
  });

  const visibleLines = entryLines.slice(scrollOffset, scrollOffset + maxBodyLines);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, entryLines.length - scrollOffset - maxBodyLines);

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      {/* Header */}
      <Box flexDirection="column" paddingX={2} paddingTop={1}>
        <Text bold color={theme.accent}>
          {title}
        </Text>
        {entry ? (
          <>
            <Text color={theme.lavender}>{formatTimestamp(entry.timestamp)}</Text>
            <Text color={theme.overlay0}>
              {entryIndex + 1} of {entries.length}
              {entryIndex > 0 ? " \u2192 newer" : ""}
              {entryIndex < entries.length - 1 ? " \u2190 older" : ""}
            </Text>
          </>
        ) : (
          <Text color={theme.overlay0}>{loaded ? "No entries available" : "Loading..."}</Text>
        )}
      </Box>

      {/* Divider */}
      <Box paddingX={2}>
        <Text color={theme.surface2}>{"─".repeat(Math.min(contentWidth, cols - 4))}</Text>
      </Box>

      {/* Entry body */}
      <Box flexDirection="column" flexGrow={1} paddingX={2} paddingTop={1}>
        {aboveCount > 0 && (
          <Text color={theme.overlay1}>
            {"\u2191"} {aboveCount} more
          </Text>
        )}
        {visibleLines.map((line, i) => {
          switch (line.type) {
            case "heading":
              return (
                <Text key={`${scrollOffset + i}`} bold color={theme.lavender}>
                  {line.text}
                </Text>
              );
            case "body":
              return (
                <Text key={`${scrollOffset + i}`} color={theme.subtext0}>
                  {line.text}
                </Text>
              );
            case "spacer":
              return <Text key={`${scrollOffset + i}`}> </Text>;
            default:
              return <Text key={`${scrollOffset + i}`}>{line.text}</Text>;
          }
        })}
        {belowCount > 0 && (
          <Text color={theme.overlay1}>
            {"\u2193"} {belowCount} more
          </Text>
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          <Text color={BRAND_BLUE}>{"\u2190\u2192"}</Text> prev/next{" "}
          <Text color={BRAND_BLUE}>{"\u2191\u2193"}</Text> scroll{" "}
          <Text color={BRAND_BLUE}>esc</Text> back
        </Text>
      </Box>
    </Box>
  );
}
