import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { installMosh } from "../../../lib/mosh";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

type Step = "prompt" | "installing" | "done" | "error";

interface Props {
  onInstalled: () => void;
  onBack: () => void;
}

function ProgressBar({ width, color }: { width: number; color: string }) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        // Slow down as we approach 90% — never hit 100 until done
        if (p < 60) return p + 3;
        if (p < 80) return p + 1.5;
        if (p < 90) return p + 0.5;
        return Math.min(p + 0.1, 95);
      });
    }, 200);
    return () => clearInterval(intervalRef.current);
  }, []);

  const barWidth = Math.max(10, width - 6);
  const filled = Math.round((progress / 100) * barWidth);
  const empty = barWidth - filled;

  return (
    <Box>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color={color} dimColor>
        {"░".repeat(empty)}
      </Text>
      <Text color={color}> {Math.round(progress)}%</Text>
    </Box>
  );
}

export function MoshInstallPage({ onInstalled, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();
  const [step, setStep] = useState<Step>("prompt");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (step !== "installing") return;
    (async () => {
      const result = await installMosh();
      if (result.success) {
        setStep("done");
        await new Promise((r) => setTimeout(r, 1000));
        onInstalled();
      } else {
        setStep("error");
        setErrorMsg(result.error || "Install failed");
      }
    })();
  }, [step, onInstalled]);

  useInput((input, key) => {
    if (step === "installing") return;

    if (step === "error") {
      if (key.escape || input === "n" || input === "N") {
        onBack();
      }
      return;
    }

    if (step === "prompt") {
      if (input === "y" || input === "Y") {
        setStep("installing");
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        onBack();
      }
    }
  });

  const boxWidth = Math.min(55, cols - 4);

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          {step === "done" ? "MOSH INSTALLED" : step === "error" ? "INSTALL FAILED" : "MOSH SETUP"}
        </Text>
        <Text> </Text>

        <Box
          flexDirection="column"
          width={boxWidth}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={step === "error" ? theme.red : step === "done" ? theme.green : theme.accent}
          paddingX={2}
          paddingY={1}
        >
          <Text color={theme.overlay1}>
            Mosh keeps your session alive over unreliable networks — handles packet loss, Wi-Fi
            roaming, and high latency without disconnecting.
          </Text>

          <Text> </Text>

          {step === "prompt" && (
            <>
              <Text color={theme.yellow}>mosh is not installed on this machine</Text>
              <Text> </Text>
              <Text color={theme.text}>Install mosh now?</Text>
            </>
          )}

          {step === "installing" && (
            <>
              <Text color={theme.overlay1}>Installing mosh...</Text>
              <Text> </Text>
              <ProgressBar width={boxWidth - 6} color={theme.accent} />
            </>
          )}

          {step === "done" && <Text color={theme.green}>mosh installed successfully</Text>}

          {step === "error" && <Text color={theme.red}>✗ {errorMsg}</Text>}

          <Text> </Text>
          <Text color={theme.overlay0}>
            {step === "installing" ? (
              "Please wait..."
            ) : step === "prompt" ? (
              <>
                <Text color={BRAND_BLUE}>y</Text> install <Text color={BRAND_BLUE}>n</Text> cancel
              </>
            ) : (
              <>
                <Text color={BRAND_BLUE}>esc</Text> back
              </>
            )}
          </Text>
        </Box>
      </Box>

      <Box flexGrow={1} />
    </Box>
  );
}
