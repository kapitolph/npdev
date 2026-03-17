// Small ASCII art font (figlet "small" style) — 5 lines tall
// Each character is an array of 5 strings, all same width (padded with spaces)

const FONT: Record<string, string[]> = {
  a: ["       ", "  __ _ ", " / _` |", "| (_| |", " \\__,_|"],
  b: [" _     ", "| |__  ", "| '_ \\ ", "| |_) |", "|_.__/ "],
  c: ["      ", "  ___ ", " / __|", "| (__ ", " \\___|"],
  d: ["     _ ", "  __| |", " / _` |", "| (_| |", " \\__,_|"],
  e: ["      ", "  ___ ", " / _ \\", "|  __/", " \\___|"],
  f: ["  __ ", " / _|", "| |_ ", "|  _|", "|_|  "],
  g: ["       ", "  __ _ ", " / _` |", "| (_| |", " \\__, |"],
  h: [" _     ", "| |__  ", "| '_ \\ ", "| | | |", "|_| |_|"],
  i: [" _ ", "(_)", "| |", "| |", "|_|"],
  j: ["   _ ", "  (_)", "  | |", "  | |", " _/ |"],
  k: [" _    ", "| | __", "| |/ /", "|   < ", "|_|\\_\\"],
  l: [" _ ", "| |", "| |", "| |", "|_|"],
  m: ["           ", " _ __ ___  ", "| '_ ` _ \\ ", "| | | | | |", "|_| |_| |_|"],
  n: ["       ", " _ __  ", "| '_ \\ ", "| | | |", "|_| |_|"],
  o: ["       ", "  ___  ", " / _ \\ ", "| (_) |", " \\___/ "],
  p: ["       ", " _ __  ", "| '_ \\ ", "| |_) |", "| .__/ "],
  q: ["       ", "  __ _ ", " / _` |", "| (_| |", " \\__, |"],
  r: ["      ", " _ __ ", "| '__|", "| |   ", "|_|   "],
  s: ["     ", " ___ ", "/ __|", "\\__ \\", "|___/"],
  t: [" _   ", "| |_ ", "| __|", "| |_ ", " \\__|"],
  u: ["       ", " _   _ ", "| | | |", "| |_| |", " \\__,_|"],
  v: ["       ", "__   __", "\\ \\ / /", " \\ V / ", "  \\_/  "],
  w: ["          ", "__      __", "\\ \\ /\\ / /", " \\ V  V / ", "  \\_/\\_/  "],
  x: ["      ", "__  __", "\\ \\/ /", " >  < ", "/_/\\_\\"],
  y: ["       ", " _   _ ", "| | | |", "| |_| |", " \\__, |"],
  z: ["     ", " ____", "|_  /", " / / ", "/___|"],
  "0": ["  ___  ", " / _ \\ ", "| | | |", "| |_| |", " \\___/ "],
  "1": [" _ ", "/ |", "| |", "| |", "|_|"],
  "2": [" ____  ", "|___ \\ ", "  __) |", " / __/ ", "|_____|"],
  "3": [" _____ ", "|___ / ", "  |_ \\ ", " ___) |", "|____/ "],
  "4": [" _  _   ", "| || |  ", "| || |_ ", "|__   _|", "   |_|  "],
  "5": [" ____  ", "| ___| ", "|___ \\ ", " ___) |", "|____/ "],
  "6": ["  __   ", " / /_  ", "| '_ \\ ", "| (_) |", " \\___/ "],
  "7": [" _____ ", "|___  |", "   / / ", "  / /  ", " /_/   "],
  "8": ["  ___  ", " ( _ ) ", " / _ \\ ", "| (_) |", " \\___/ "],
  "9": ["  ___  ", " / _ \\ ", "| (_) |", " \\__, |", "   /_/ "],
  "-": ["      ", "      ", " ____ ", "|____|", "      "],
  _: ["        ", "        ", "        ", " ______ ", "|______|"],
  ".": ["   ", "   ", "   ", " _ ", "(_)"],
  " ": ["  ", "  ", "  ", "  ", "  "],
};

const LINE_COUNT = 5;

/**
 * Render text as ASCII art (style H — small figlet).
 * Returns an array of 5 strings, one per line.
 * Characters not in the font are skipped.
 */
export function renderAsciiText(text: string): string[] {
  const lower = text.toLowerCase();
  const lines: string[] = Array.from({ length: LINE_COUNT }, () => "");

  for (const ch of lower) {
    const glyph = FONT[ch];
    if (!glyph) continue;
    for (let row = 0; row < LINE_COUNT; row++) {
      lines[row] += glyph[row];
    }
  }

  return lines;
}

/**
 * Render text as ASCII art, truncated to fit within maxWidth.
 * Adds characters one at a time until the next would exceed width.
 */
export function renderAsciiTextFit(text: string, maxWidth: number): string[] {
  const lower = text.toLowerCase();
  const lines: string[] = Array.from({ length: LINE_COUNT }, () => "");
  let currentWidth = 0;

  for (const ch of lower) {
    const glyph = FONT[ch];
    if (!glyph) continue;
    const charWidth = glyph[0].length;
    if (currentWidth + charWidth > maxWidth) break;
    for (let row = 0; row < LINE_COUNT; row++) {
      lines[row] += glyph[row];
    }
    currentWidth += charWidth;
  }

  return lines;
}
