import { mkdir, writeFile } from "node:fs/promises";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { CONFIG_FILE, npdevDir } from "../../../lib/config";
import { sshExec } from "../../../lib/ssh";
import type { Machine } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";

type Step = "name" | "email" | "token" | "saving" | "done" | "error";

interface Props {
  machine: Machine;
  onDone: (npdevUser: string) => void;
  onBack: () => void;
}

export function SetupPage({ machine, onDone, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // When name is submitted, pre-fill email
  const submitName = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setEmail(`${trimmed}@nextfinancial.io`);
    setStep("email");
    setError("");
  }, [name]);

  const submitEmail = useCallback(() => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required");
      return;
    }
    setStep("token");
    setError("");
  }, [email]);

  const submitToken = useCallback(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Token is required");
      return;
    }
    setStep("saving");
    setError("");
  }, [token]);

  // Run save logic when step becomes "saving"
  useEffect(() => {
    if (step !== "saving") return;
    const devName = name.trim();
    const devEmail = email.trim();
    const ghToken = token.trim();

    (async () => {
      try {
        // Save local config
        setStatusMsg("Saving local config...");
        await mkdir(npdevDir(), { recursive: true });
        await writeFile(
          CONFIG_FILE,
          `# npdev config — managed by npdev setup\nNPDEV_USER="${devName}"\n`,
        );

        // Create env on VPS
        setStatusMsg("Creating VPS identity...");
        const envContent = `# Developer identity for ${devName}
export GIT_AUTHOR_NAME="${devName}"
export GIT_AUTHOR_EMAIL="${devEmail}"
export GIT_COMMITTER_NAME="${devName}"
export GIT_COMMITTER_EMAIL="${devEmail}"
export GH_TOKEN="${ghToken}"`;

        const { exitCode } = await sshExec(
          machine,
          `mkdir -p ~/.vps/developers && cat > ~/.vps/developers/${devName}.env << 'DEVEOF'\n${envContent}\nDEVEOF\nchmod 600 ~/.vps/developers/${devName}.env`,
        );
        if (exitCode !== 0) throw new Error("Failed to create VPS identity file");

        // Setup git credential helper
        setStatusMsg("Configuring credentials...");
        await sshExec(
          machine,
          `if [[ ! -f ~/.vps/git-credential-token ]]; then
cat > ~/.vps/git-credential-token << 'CREDHELPER'
#!/bin/bash
if [[ -n "\${GH_TOKEN:-}" ]]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=\${GH_TOKEN}"
fi
CREDHELPER
chmod +x ~/.vps/git-credential-token
git config --global credential.helper "!bash ~/.vps/git-credential-token"
fi`,
        );

        setStep("done");
        setStatusMsg(`Identity saved for ${devName}`);

        // Auto-return after a beat
        await new Promise((r) => setTimeout(r, 1500));
        onDone(devName);
      } catch (err) {
        setStep("error");
        setStatusMsg(err instanceof Error ? err.message : "Setup failed");
      }
    })();
  }, [step, name, email, token, machine, onDone]);

  useInput((input, key) => {
    if (step === "saving") return;

    if (key.escape) {
      if (step === "error" || step === "done") {
        onBack();
        return;
      }
      if (step === "token") {
        setStep("email");
        setError("");
        return;
      }
      if (step === "email") {
        setStep("name");
        setError("");
        return;
      }
      onBack();
      return;
    }

    if (step === "name") {
      if (key.return) {
        submitName();
        return;
      }
      if (key.backspace || key.delete) {
        setName((v) => v.slice(0, -1));
        setError("");
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setName((v) => v + input);
        setError("");
      }
      return;
    }

    if (step === "email") {
      if (key.return) {
        submitEmail();
        return;
      }
      if (key.backspace || key.delete) {
        setEmail((v) => v.slice(0, -1));
        setError("");
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEmail((v) => v + input);
        setError("");
      }
      return;
    }

    if (step === "token") {
      if (key.return) {
        submitToken();
        return;
      }
      if (key.backspace || key.delete) {
        setToken((v) => v.slice(0, -1));
        setError("");
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setToken((v) => v + input);
        setError("");
      }
      return;
    }
  });

  const stepLabels = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "token", label: "Token" },
  ];

  const stepOrder = ["name", "email", "token"];
  const currentIdx =
    step === "saving" || step === "done" || step === "error" ? 3 : stepOrder.indexOf(step);

  const activeField =
    step === "name"
      ? { label: "Your name", value: name, hint: "e.g. don" }
      : step === "email"
        ? { label: "Your email", value: email, hint: "" }
        : step === "token"
          ? { label: "GitHub token", value: token, hint: "repo, read:org scopes", masked: true }
          : null;

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          {step === "done"
            ? "SETUP COMPLETE"
            : step === "error"
              ? "SETUP FAILED"
              : "DEVELOPER SETUP"}
        </Text>
        <Text> </Text>

        <Box
          flexDirection="column"
          width={Math.min(50, cols - 4)}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={step === "error" ? theme.red : step === "done" ? theme.green : theme.accent}
          paddingX={2}
          paddingY={1}
        >
          {/* Step indicators */}
          <Box gap={2} justifyContent="center">
            {stepLabels.map((s, i) => {
              const isDone = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <Text
                  key={s.key}
                  color={isDone ? theme.green : isCurrent ? theme.accent : theme.overlay0}
                >
                  {isDone ? "✓" : isCurrent ? "›" : "○"}{" "}
                  <Text color={isDone ? theme.green : isCurrent ? theme.text : theme.overlay0}>
                    {s.label}
                  </Text>
                </Text>
              );
            })}
          </Box>

          <Text> </Text>

          {/* Active input field */}
          {activeField && (
            <>
              <Text color={theme.overlay1}>{activeField.label}</Text>
              <Box>
                <Text color={theme.text}>
                  {activeField.masked ? "•".repeat(activeField.value.length) : activeField.value}
                </Text>
                <Text color={theme.accent}>▌</Text>
              </Box>
              {error ? (
                <Box paddingTop={1}>
                  <Text color={theme.red}>✗ {error}</Text>
                </Box>
              ) : activeField.hint ? (
                <Box paddingTop={1}>
                  <Text color={theme.overlay0}>{activeField.hint}</Text>
                </Box>
              ) : null}
            </>
          )}

          {/* Saving/done/error states */}
          {(step === "saving" || step === "done" || step === "error") && (
            <Text
              color={step === "error" ? theme.red : step === "done" ? theme.green : theme.overlay1}
            >
              {statusMsg}
            </Text>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />

      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          {step === "saving" ? (
            "Please wait..."
          ) : step === "done" || step === "error" ? (
            <>
              <Text color={BRAND_BLUE}>esc</Text> back
            </>
          ) : (
            <>
              <Text color={BRAND_BLUE}>↵</Text> next · <Text color={BRAND_BLUE}>esc</Text> back
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
