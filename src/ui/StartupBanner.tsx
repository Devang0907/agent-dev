import React, { memo } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";

const INNER = 42;

const CHAR_COLORS: Record<string, string> = {
  "#": "gray",
  "@": "cyan",
  "$": "green",
  "%": "yellow",
  "^": "blue",
  "&": "magenta",
  "*": "white",
};

const BOX_CHARS = "+-|";

function colorForChar(char: string, theme: ThemeColors): string {
  if (BOX_CHARS.includes(char) || char === " ") return theme.border;
  return CHAR_COLORS[char] ?? theme.text;
}

function ColoredLine({ line, theme }: { line: string; theme: ThemeColors }) {
  const segments: { text: string; color: string }[] = [];
  let run = "";
  let runColor = "";

  for (const char of line) {
    const color = colorForChar(char, theme);
    if (run && color !== runColor) {
      segments.push({ text: run, color: runColor });
      run = char;
      runColor = color;
    } else {
      run += char;
      runColor = color;
    }
  }
  if (run) segments.push({ text: run, color: runColor });

  return (
    <Text>
      {segments.map((s, i) => (
        <Text key={i} color={s.color}>{s.text}</Text>
      ))}
    </Text>
  );
}

function center(text: string): string {
  if (text.length >= INNER) return text.slice(0, INNER);
  const pad = INNER - text.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + text + " ".repeat(pad - left);
}

function row(content: string): string {
  const inner = content.length > INNER ? content.slice(0, INNER) : content.padEnd(INNER);
  return "|" + inner + "|";
}

function border(): string {
  return "+" + "-".repeat(INNER) + "+";
}

function buildRobotLines(): string[] {
  // Every line in `head` is built to the same fixed width (23 chars) so
  // center() applies identical padding to each one and the face stays
  // aligned: antenna -> rounded head -> eyes -> mouth grille -> bolts.
  const head = [
    "." + "-".repeat(21) + ".", // head top, rounded corners
    "|" + " ".repeat(6) + "@@" + " ".repeat(5) + "@@" + " ".repeat(6) + "|", // eyes
    "|" + " ".repeat(21) + "|", // visor gap
    "|" + " ".repeat(6) + "# # # # #" + " ".repeat(6) + "|", // mouth grille
    "'" + "-".repeat(21) + "'", // head bottom, rounded corners
    " ".repeat(9) + "+" + " ".repeat(3) + "+" + " ".repeat(9), // neck bolts
  ];

  return [
    border(),
    row(center("#%@$^&*  AGENT-DEV  *&^$@#%")),
    row(""),
    ...head.map((line) => row(center(line))),
    row(""),
    border(),
  ];
}

const ROBOT_LINES = buildRobotLines();
const ROBOT_MINI = "<@ @>  AGENT-DEV  <@ @>";

interface StartupBannerProps {
  theme: ThemeColors;
  compact?: boolean;
}

export const StartupBanner = memo(function StartupBanner({
  theme,
  compact,
}: StartupBannerProps) {
  if (compact) {
    return (
      <Box marginBottom={1}>
        <ColoredLine line={ROBOT_MINI} theme={theme} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {ROBOT_LINES.map((line, i) => (
        <ColoredLine key={i} line={line} theme={theme} />
      ))}
    </Box>
  );
});