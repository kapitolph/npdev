import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { ReleaseInfo } from "../../../types";
import { relativeTimeFromISO } from "../../../lib/version";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";

interface Props {
  latestStable: ReleaseInfo | null;
  latestNightly: ReleaseInfo | null;
  currentChannel: "stable" | "nightly";
  onSelect: (channel: "stable" | "nightly") => void;
  onBack: () => void;
}

export function UpdateChannelPage({ latestStable, latestNightly, currentChannel, onSelect, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();

  type Channel = "stable" | "nightly";
  const channels: Channel[] = [];
  if (latestStable) channels.push("stable");
  if (latestNightly) channels.push("nightly");

  // Pre-select: prefer the channel that has an update, or first available
  const initialIdx = currentChannel === "nightly" && channels.includes("stable")
    ? channels.indexOf("stable")
    : channels.includes("nightly") ? channels.indexOf("nightly") : 0;

  const [cursor, setCursor] = useState(Math.max(0, initialIdx));

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor(c => Math.min(channels.length - 1, c + 1));
      return;
    }
    if (key.return) {
      const selected = channels[cursor];
      if (selected) onSelect(selected);
    }
  });

  if (channels.length === 0) {
    return (
      <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
        <Box flexGrow={1} />
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.overlay0}>No updates available</Text>
        </Box>
        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color={theme.overlay0}>Press esc to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>UPDATE</Text>
        <Text> </Text>

        <Box
          flexDirection="column"
          width={Math.min(40, cols - 4)}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={theme.accent}
          paddingX={2}
          paddingY={1}
        >
          {channels.map((ch, i) => {
            const isFocused = i === cursor;
            const info = ch === "stable" ? latestStable : latestNightly;
            const color = ch === "stable" ? theme.green : theme.lavender;
            const label = ch === "stable" ? "Stable" : "Nightly";
            const ver = info?.version || "unknown";
            const time = info?.publishedAt ? relativeTimeFromISO(info.publishedAt) : "";
            // Truncate long nightly versions
            const displayVer = ver.length > 20 ? `${ver.slice(0, 17)}..` : ver;

            return (
              <Box key={ch} flexDirection="column" paddingBottom={i < channels.length - 1 ? 1 : 0}>
                <Box>
                  <Text color={isFocused ? color : theme.overlay0}>
                    {isFocused ? "▸ " : "  "}
                  </Text>
                  <Text color={isFocused ? color : theme.overlay1} bold={isFocused}>
                    {label}
                  </Text>
                  <Text color={isFocused ? theme.text : theme.overlay0}>
                    {"    "}v{displayVer}
                  </Text>
                </Box>
                {time && (
                  <Box>
                    <Text color={theme.overlay0}>
                      {"   Released "}
                      {time}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box flexGrow={1} />

      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          {"↑↓ select · ↵ confirm · esc back"}
        </Text>
      </Box>
    </Box>
  );
}
