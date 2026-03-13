// Catppuccin Mocha palette + dual theme system for npdev TUI

// Base Catppuccin Mocha colors (shared across themes)
const palette = {
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  text: "#cdd6f4",
  subtext1: "#bac2de",
  subtext0: "#a6adc8",
  overlay2: "#9399b2",
  overlay1: "#7f849c",
  overlay0: "#6c7086",
  blue: "#89b4fa",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  red: "#f38ba8",
  mauve: "#cba6f7",
  teal: "#94e2d5",
  peach: "#fab387",
  pink: "#f5c2e7",
  sky: "#89dcfe",
  lavender: "#b4befe",
} as const;

export interface Theme {
  // Base palette
  base: string;
  mantle: string;
  crust: string;
  surface0: string;
  surface1: string;
  surface2: string;
  text: string;
  subtext1: string;
  subtext0: string;
  overlay2: string;
  overlay1: string;
  overlay0: string;
  blue: string;
  green: string;
  yellow: string;
  red: string;
  mauve: string;
  teal: string;
  peach: string;
  pink: string;
  sky: string;
  lavender: string;
  // Semantic
  accent: string;
  sessionActive: string;
  sessionIdle: string;
  sessionStale: string;
  cursor: string;
  border: string;
  borderFocused: string;
  dimmed: string;
  // New semantic tokens
  highlight: string;
  buttonBg: string;
  buttonFocusBg: string;
  tabActive: string;
  tabInactive: string;
  // Panel tokens
  screenBg: string;
  panelBg: string;
  panelBorder: string;
  panelBorderFocused: string;
  // Context badge
  contextBadge: { label: string; color: string };
}

export function getTheme(context: "remote" | "local"): Theme {
  const accent = context === "local" ? palette.teal : palette.mauve;

  return {
    ...palette,
    // Semantic
    accent,
    sessionActive: palette.green,
    sessionIdle: palette.blue,
    sessionStale: palette.yellow,
    cursor: accent,
    border: palette.surface2,
    borderFocused: accent,
    dimmed: palette.overlay0,
    // New semantic tokens
    highlight: palette.surface0,
    buttonBg: palette.surface1,
    buttonFocusBg: accent,
    tabActive: accent,
    tabInactive: palette.overlay1,
    // Panel tokens
    screenBg: palette.crust,
    panelBg: palette.base,
    panelBorder: palette.surface2,
    panelBorderFocused: accent,
    // Context badge
    contextBadge:
      context === "local"
        ? { label: "VPS", color: palette.teal }
        : { label: "REMOTE", color: palette.mauve },
  };
}

// Unicode Math Sans-Serif Bold converter for button labels
export function toBold(str: string): string {
  return [...str].map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + (code - 65));  // A-Z
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + (code - 97)); // a-z
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + (code - 48));  // 0-9
    return c;
  }).join("");
}

// Status indicators
export const icons = {
  active: "●",
  idle: "○",
  stale: "◌",
  attached: "◆",
  cursor: "▸",
  bullet: "·",
  separator: "│",
  warning: "▲",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

// Brand constant
export const BRAND_BLUE = "#4B68FE";
