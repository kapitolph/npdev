import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { installMosh } from "../../../lib/mosh";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

type Step = "prompt" | "installing" | "done" | "error";

interface Props {
  onInstalled: () => void;
  onBack: () => void;
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
          width={Math.min(55, cols - 4)}
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
            <Text color={theme.overlay1}>Installing mosh...</Text>
          )}

          {step === "done" && (
            <Text color={theme.green}>mosh installed successfully</Text>
          )}

          {step === "error" && (
            <Text color={theme.red}>✗ {errorMsg}</Text>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />

      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          {step === "installing" ? (
            "Please wait..."
          ) : step === "prompt" ? (
            <>
              <Text color={BRAND_BLUE}>y</Text> install  <Text color={BRAND_BLUE}>n</Text> cancel
            </>
          ) : (
            <>
              <Text color={BRAND_BLUE}>esc</Text> back
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
