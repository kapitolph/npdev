import { basename } from "node:path";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { scpUpload } from "../../../lib/ssh";
import type { Machine, RepoData } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { BRAND_BLUE } from "../theme";
import { Spinner } from "./Spinner";

type Step = "select-project" | "input-path" | "uploading" | "done" | "error";

interface Props {
  machine: Machine;
  repos: RepoData[];
  isOnVPS: boolean;
  onBack: () => void;
}

function normalizePath(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^['"]|['"]$/g, "");
  p = p.replace(/^file:\/\//, "");
  p = p.replace(/\\ /g, " ");
  return p.trim();
}

export function UploadPage({ machine, repos, isOnVPS, onBack }: Props) {
  const theme = useTheme();
  const { cols, rows } = useTerminalSize();

  const [step, setStep] = useState<Step>("select-project");
  const [projectCursor, setProjectCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState<RepoData | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [normalizedPath, setNormalizedPath] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const cardWidth = Math.min(55, cols - 4);
  const maxVisible = Math.max(2, Math.min(repos.length, rows - 16));

  // Upload effect
  useEffect(() => {
    if (step !== "uploading" || !selectedRepo) return;
    const remotePath = `${selectedRepo.path}/dev-image-dump/${basename(normalizedPath)}`;
    (async () => {
      try {
        const { exitCode, error } = await scpUpload(machine, normalizedPath, remotePath);
        if (exitCode !== 0) {
          setErrorMsg(error || "Upload failed");
          setStep("error");
        } else {
          setResultMsg(remotePath);
          setStep("done");
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Upload failed");
        setStep("error");
      }
    })();
  }, [step, selectedRepo, normalizedPath, machine]);

  useInput((input, key) => {
    if (step === "uploading") return;

    // Done / Error — any key goes back
    if (step === "done" || step === "error") {
      if (key.return || key.escape) {
        onBack();
      }
      return;
    }

    // Select project
    if (step === "select-project") {
      if (key.escape) {
        onBack();
        return;
      }
      if (repos.length === 0) return;

      if (key.upArrow) {
        setProjectCursor((c) => {
          const next = Math.max(0, c - 1);
          setScrollOffset((o) => (next < o ? next : o));
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setProjectCursor((c) => {
          const next = Math.min(repos.length - 1, c + 1);
          setScrollOffset((o) => (next >= o + maxVisible ? next - maxVisible + 1 : o));
          return next;
        });
        return;
      }
      if (key.return) {
        setSelectedRepo(repos[projectCursor]);
        setStep("input-path");
      }
      return;
    }

    // Input path
    if (step === "input-path") {
      if (key.escape) {
        setStep("select-project");
        setPathInput("");
        setErrorMsg("");
        return;
      }
      if (key.return) {
        const np = normalizePath(pathInput);
        if (!np) {
          setErrorMsg("Path is required");
          return;
        }
        setNormalizedPath(np);
        setErrorMsg("");
        setStep("uploading");
        return;
      }
      if (key.backspace || key.delete) {
        setPathInput((v) => v.slice(0, -1));
        setErrorMsg("");
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setPathInput((v) => v + input);
        setErrorMsg("");
      }
      return;
    }
  });

  const titleText = step === "done"
    ? "UPLOAD COMPLETE"
    : step === "error"
      ? "UPLOAD FAILED"
      : "UPLOAD FILE";

  const borderColor = step === "done"
    ? theme.green
    : step === "error"
      ? theme.red
      : theme.accent;

  return (
    <Box flexDirection="column" width={cols} height={rows} backgroundColor={theme.screenBg}>
      <Box flexGrow={1} />

      <Box flexDirection="column" alignItems="center">
        <Text color={theme.overlay0} dimColor>
          {titleText}
        </Text>
        <Text> </Text>

        <Box
          flexDirection="column"
          width={cardWidth}
          backgroundColor={theme.panelBg}
          borderStyle="round"
          borderColor={borderColor}
          paddingX={2}
          paddingY={1}
        >
          {/* Step: Select project */}
          {step === "select-project" && (
            repos.length === 0 ? (
              <Text color={theme.overlay1}>No projects found</Text>
            ) : (
              <>
                <Text color={theme.overlay1}>Select project</Text>
                <Text> </Text>
                {repos.slice(scrollOffset, scrollOffset + maxVisible).map((repo, i) => {
                  const idx = scrollOffset + i;
                  const isCurrent = idx === projectCursor;
                  return (
                    <Text key={repo.path} color={isCurrent ? theme.text : theme.overlay1}>
                      {isCurrent ? "  \u25B8 " : "    "}
                      {repo.name}
                    </Text>
                  );
                })}
              </>
            )
          )}

          {/* Step: Input path */}
          {step === "input-path" && selectedRepo && (
            <>
              <Text color={theme.green}>{"\u2713"} {selectedRepo.name}</Text>
              <Text> </Text>
              <Text color={theme.overlay1}>Drag a file here or type path</Text>
              <Box>
                <Text color={theme.text}>{pathInput}</Text>
                <Text color={theme.accent}>{"\u258C"}</Text>
              </Box>
              {errorMsg ? (
                <Box paddingTop={1}>
                  <Text color={theme.red}>{"\u2717"} {errorMsg}</Text>
                </Box>
              ) : (
                <Box paddingTop={1}>
                  <Text color={theme.overlay0}>{"\u2192"} dev-image-dump/</Text>
                </Box>
              )}
            </>
          )}

          {/* Step: Uploading */}
          {step === "uploading" && (
            <>
              <Text color={theme.green}>{"\u2713"} {selectedRepo?.name}</Text>
              <Text> </Text>
              <Spinner label={`Uploading ${basename(normalizedPath)}...`} />
            </>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <>
              <Text color={theme.green}>{"\u2713"} Uploaded {basename(normalizedPath)}</Text>
              <Text> </Text>
              <Text color={theme.overlay0}>{resultMsg}</Text>
            </>
          )}

          {/* Step: Error */}
          {step === "error" && (
            <>
              <Text color={theme.red}>{"\u2717"} Upload failed</Text>
              <Text> </Text>
              <Text color={theme.overlay1}>{errorMsg}</Text>
            </>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />

      <Box paddingX={1}>
        <Text color={theme.overlay0}>
          {step === "uploading" ? (
            "Please wait..."
          ) : step === "select-project" ? (
            <>
              <Text color={BRAND_BLUE}>{"\u2191\u2193"}</Text> select{" "}
              <Text color={BRAND_BLUE}>{"\u21B5"}</Text> confirm{" "}
              <Text color={BRAND_BLUE}>esc</Text> back
            </>
          ) : step === "input-path" ? (
            <>
              <Text color={BRAND_BLUE}>{"\u21B5"}</Text> upload{" "}
              <Text color={BRAND_BLUE}>esc</Text> back
            </>
          ) : (
            <>
              <Text color={BRAND_BLUE}>{"\u21B5"}</Text> done{" "}
              <Text color={BRAND_BLUE}>esc</Text> back
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
