import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { Box, Text } from "ink";
import { useCallback, useEffect, useState } from "react";
import { MACHINES_FILE, npdevDir } from "../../../lib/config";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

const GITHUB_REPO = "kapitolph/npdev";

type UpdateStep = "machines" | "version" | "binary" | "done" | "error";

interface StepState {
  step: UpdateStep;
  progress: number; // 0-1
  message: string;
  newVersion: string;
  error?: string;
}

function ProgressBar({
  progress,
  width,
  color,
  trackColor,
}: {
  progress: number;
  width: number;
  color: string;
  trackColor: string;
}) {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={trackColor}>{"░".repeat(empty)}</Text>
    </Text>
  );
}

interface Props {
  onDone: () => void;
}

export function UpdatePage({ onDone }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const [state, setState] = useState<StepState>({
    step: "machines",
    progress: 0,
    message: "Fetching machines.yaml...",
    newVersion: "",
  });
  const [tick, setTick] = useState(0);

  // Animate progress within steps
  useEffect(() => {
    if (state.step === "done" || state.step === "error") return;
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, [state.step]);

  const runUpdate = useCallback(async () => {
    // Step 1: machines.yaml
    setState((s) => ({
      ...s,
      step: "machines",
      progress: 0,
      message: "Fetching machines.yaml...",
    }));
    try {
      const resp = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const content = await resp.text();
      await mkdir(npdevDir(), { recursive: true });
      await writeFile(MACHINES_FILE, content);
    } catch {
      setState((s) => ({
        ...s,
        step: "error",
        error: "Failed to fetch machines.yaml",
      }));
      return;
    }
    setState((s) => ({ ...s, progress: 1, message: "machines.yaml updated" }));

    // Brief pause for visual
    await new Promise((r) => setTimeout(r, 300));

    // Step 2: version
    setState((s) => ({
      ...s,
      step: "version",
      progress: 0,
      message: "Checking latest version...",
    }));
    let newVersion = "unknown";
    try {
      const vResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: "application/vnd.github+json" },
      });
      if (vResp.ok) {
        const data = (await vResp.json()) as { tag_name?: string };
        if (data.tag_name) newVersion = data.tag_name.replace(/^v/, "");
      }
    } catch {
      // continue
    }
    setState((s) => ({
      ...s,
      progress: 1,
      newVersion,
      message: `Latest: v${newVersion}`,
    }));

    await new Promise((r) => setTimeout(r, 300));

    // Step 3: binary
    setState((s) => ({ ...s, step: "binary", progress: 0, message: "Downloading binary..." }));
    try {
      const os = process.platform === "darwin" ? "darwin" : "linux";
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/npdev-${os}-${arch}`;
      const resp = await fetch(url, { redirect: "follow" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      setState((s) => ({ ...s, progress: 0.3, message: "Downloading..." }));

      const buffer = await resp.arrayBuffer();
      setState((s) => ({ ...s, progress: 0.7, message: "Installing..." }));

      const execPath = process.execPath;
      const tmpPath = `${execPath}.tmp`;
      await writeFile(tmpPath, Buffer.from(buffer));
      await chmod(tmpPath, 0o755);
      try {
        await unlink(execPath);
      } catch {}
      await rename(tmpPath, execPath);

      if (process.platform === "darwin") {
        const { execSync } = await import("node:child_process");
        try {
          execSync(`codesign -s - "${execPath}"`, { stdio: "ignore" });
        } catch {}
      }

      setState((s) => ({ ...s, progress: 1, message: "Binary updated" }));
    } catch {
      setState((s) => ({
        ...s,
        progress: 1,
        message: "Binary not available yet — using current version",
      }));
    }

    await new Promise((r) => setTimeout(r, 500));

    // Done
    setState((s) => ({
      ...s,
      step: "done",
      progress: 1,
      message: `Updated to v${newVersion}`,
    }));

    // Auto-exit after a beat
    await new Promise((r) => setTimeout(r, 1500));
    onDone();
  }, [onDone]);

  // Start update on mount
  useEffect(() => {
    runUpdate();
  }, [runUpdate]);

  const barWidth = Math.min(40, cols - 8);

  // Spinner animation
  const spinChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinner = spinChars[tick % spinChars.length];

  const steps: { key: UpdateStep; label: string }[] = [
    { key: "machines", label: "Config" },
    { key: "version", label: "Version" },
    { key: "binary", label: "Binary" },
  ];

  const stepOrder: UpdateStep[] = ["machines", "version", "binary"];
  const currentIdx = stepOrder.indexOf(
    state.step === "done" || state.step === "error" ? "binary" : state.step,
  );

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          {state.step === "done"
            ? "UPDATE COMPLETE"
            : state.step === "error"
              ? "UPDATE FAILED"
              : "UPDATING"}
        </Text>
        <Text> </Text>

        {/* Progress area */}
        <Box
          flexDirection="column"
          width={Math.min(50, cols - 4)}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={
            state.step === "error" ? theme.red : state.step === "done" ? theme.green : theme.accent
          }
          paddingX={2}
          paddingY={1}
        >
          {/* Step indicators */}
          <Box gap={2} justifyContent="center">
            {steps.map((s, i) => {
              const isDone = i < currentIdx || state.step === "done";
              const isCurrent = i === currentIdx && state.step !== "done" && state.step !== "error";
              return (
                <Text
                  key={s.key}
                  color={isDone ? theme.green : isCurrent ? theme.accent : theme.overlay0}
                >
                  {isDone ? "✓" : isCurrent ? spinner : "○"}{" "}
                  <Text color={isDone ? theme.green : isCurrent ? theme.text : theme.overlay0}>
                    {s.label}
                  </Text>
                </Text>
              );
            })}
          </Box>

          <Text> </Text>

          {/* Progress bar */}
          {state.step !== "done" && state.step !== "error" && (
            <ProgressBar
              progress={state.progress}
              width={barWidth}
              color={theme.accent}
              trackColor={theme.surface0}
            />
          )}
          {state.step === "done" && (
            <ProgressBar
              progress={1}
              width={barWidth}
              color={theme.green}
              trackColor={theme.surface0}
            />
          )}

          <Text> </Text>

          {/* Status message */}
          <Text color={state.step === "error" ? theme.red : theme.overlay1}>{state.message}</Text>

          {state.step === "done" && state.newVersion && (
            <Box paddingTop={1}>
              <Text color={theme.green}>Restart npdev to use v{state.newVersion}</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />

      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          {state.step === "done" || state.step === "error" ? (
            <>
              <Text color={BRAND_BLUE}>esc</Text> exit
            </>
          ) : (
            "Please wait..."
          )}
        </Text>
      </Box>
    </Box>
  );
}
