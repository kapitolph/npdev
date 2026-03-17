import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { relativeTimeFromISO } from "../../../lib/version";
import type { ReleaseInfo } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";

interface Props {
  latestStable: ReleaseInfo | null;
  latestNightly: ReleaseInfo | null;
  currentChannel: "stable" | "nightly";
  onSelect: (channel: "stable" | "nightly") => void;
  onBack: () => void;
}

type Phase = "select" | "confirm-nightly";

export function UpdateChannelPage({
  latestStable,
  latestNightly,
  currentChannel,
  onSelect,
  onBack,
}: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();

  const hasStable = latestStable !== null;
  const hasNightly = latestNightly !== null;

  type Channel = "stable" | "nightly";
  const channels: Channel[] = ["stable", "nightly"];

  // Pre-select: prefer stable if on nightly (downgrade), otherwise first available update
  const initialIdx = currentChannel === "nightly" ? 0 : hasStable ? 0 : hasNightly ? 1 : 0;

  const [cursor, setCursor] = useState(initialIdx);
  const [phase, setPhase] = useState<Phase>("select");

  useInput((input, key) => {
    if (phase === "confirm-nightly") {
      if (key.return || input === "y" || input === "Y") {
        onSelect("nightly");
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        setPhase("select");
        return;
      }
      return;
    }

    // Phase: select
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(channels.length - 1, c + 1));
      return;
    }
    if (key.return) {
      const selected = channels[cursor];
      const isAvailable = selected === "stable" ? hasStable : hasNightly;
      if (!isAvailable) return; // can't select grayed-out channel
      if (selected === "nightly") {
        setPhase("confirm-nightly");
      } else {
        onSelect(selected);
      }
    }
  });

  const panelWidth = Math.min(44, cols - 4);

  // Nightly confirmation overlay
  if (phase === "confirm-nightly") {
    return (
      <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
        <Box flexGrow={1} />

        <Box flexDirection="column" alignItems="center">
          <Text color={theme.yellow} bold>
            INSTALL NIGHTLY?
          </Text>
          <Text> </Text>

          <Box
            flexDirection="column"
            width={panelWidth}
            backgroundColor={theme.panelBg}
            borderStyle="round"
            borderColor={theme.yellow}
            paddingX={2}
            paddingY={1}
          >
            <Text color={theme.text}>
              Nightly builds may contain untested changes{"\n"}and could be unstable.
            </Text>
            <Text> </Text>
            <Text color={theme.overlay1}>You can always revert to stable with:</Text>
            <Text color={theme.green} bold>
              {" "}
              npdev update
            </Text>
          </Box>
        </Box>

        <Box flexGrow={1} />

        <Box paddingX={1}>
          <Text color={theme.overlay0}>{"↵/y confirm · esc/n cancel"}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          UPDATE
        </Text>
        <Text> </Text>

        <Box
          flexDirection="column"
          width={panelWidth}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={theme.accent}
          paddingX={2}
          paddingY={1}
        >
          {channels.map((ch, i) => {
            const isFocused = i === cursor;
            const info = ch === "stable" ? latestStable : latestNightly;
            const isAvailable = info !== null;
            const accentColor = ch === "stable" ? theme.green : theme.lavender;
            const label = ch === "stable" ? "Stable" : "Nightly";

            if (!isAvailable) {
              // Grayed-out row — no update for this channel
              return (
                <Box
                  key={ch}
                  flexDirection="column"
                  paddingBottom={i < channels.length - 1 ? 1 : 0}
                >
                  <Box>
                    <Text color={isFocused ? theme.surface2 : theme.surface1}>
                      {isFocused ? "▸ " : "  "}
                    </Text>
                    <Text color={theme.surface2}>{label}</Text>
                    <Text color={theme.surface2}>{"    "}No update available</Text>
                  </Box>
                </Box>
              );
            }

            const ver = info.version;
            const time = info.publishedAt ? relativeTimeFromISO(info.publishedAt) : "";
            const displayVer = ver.length > 18 ? `${ver.slice(0, 15)}..` : ver;

            return (
              <Box key={ch} flexDirection="column" paddingBottom={i < channels.length - 1 ? 1 : 0}>
                <Box>
                  <Text color={isFocused ? accentColor : theme.overlay0}>
                    {isFocused ? "▸ " : "  "}
                  </Text>
                  <Text color={isFocused ? accentColor : theme.overlay1} bold={isFocused}>
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
        <Text color={theme.overlay0}>{"↑↓ select · ↵ confirm · esc back"}</Text>
      </Box>
    </Box>
  );
}
