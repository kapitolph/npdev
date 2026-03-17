import { useStdout } from "ink";

export function useTerminalSize() {
  const { stdout } = useStdout();
  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;
  return { cols, rows };
}
