import React, { memo } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";

/**
 * 5x7 block-letter glyphs for the "AGENT-DEV" wordmark.
 * "█" = lit pixel, " " = empty pixel. Every glyph is exactly 5 columns
 * wide and 7 rows tall, so glyphs line up cleanly when concatenated
 * row-by-row to spell out a word.
 */
const GLYPH_HEIGHT = 7;
const GLYPH_WIDTH = 5;

const GLYPHS: Record<string, string[]> = {
  A: ["  █  ", " █ █ ", "█   █", "█████", "█   █", "█   █", "█   █"],
  G: [" ███ ", "█    ", "█    ", "█ ███", "█   █", "█   █", " ███ "],
  E: ["█████", "█    ", "█    ", "████ ", "█    ", "█    ", "█████"],
  N: ["█   █", "██  █", "█ █ █", "█  ██", "█   █", "█   █", "█   █"],
  T: ["█████", "  █  ", "  █  ", "  █  ", "  █  ", "  █  ", "  █  "],
  "-": ["     ", "     ", "     ", "█████", "     ", "     ", "     "],
  D: ["████ ", "█   █", "█   █", "█   █", "█   █", "█   █", "████ "],
  V: ["█   █", "█   █", "█   █", "█   █", " █ █ ", " █ █ ", "  █  "],
};

const BLANK_GLYPH = Array(GLYPH_HEIGHT).fill(" ".repeat(GLYPH_WIDTH));

/** Wordmark color — matches the brand logo regardless of active theme. */
const LOGO_COLOR = "#F2A154";

function glyphFor(char: string): string[] {
  return GLYPHS[char.toUpperCase()] ?? BLANK_GLYPH;
}

/** Builds the word as GLYPH_HEIGHT lines of text, gap columns between letters. */
function buildBlockLines(word: string, gap = 1): string[] {
  const glyphs = word.split("").map(glyphFor);
  const gapStr = " ".repeat(gap);
  const lines: string[] = [];
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    lines.push(glyphs.map((g) => g[row]).join(gapStr));
  }
  return lines;
}

const LOGO_LINES = buildBlockLines("AGENT-DEV");
const LOGO_MINI = "AGENT-DEV";

interface StartupBannerProps {
  theme: ThemeColors;
  compact?: boolean;
}

export const StartupBanner = memo(function StartupBanner({
  theme,
  compact,
}: StartupBannerProps) {
  // Falls back to the brand orange; lets a theme override via an
  // optional `accent` field without forcing it into ThemeColors.
  const color = (theme as { accent?: string }).accent ?? LOGO_COLOR;

  if (compact) {
    return (
      <Box marginBottom={1}>
        <Text color={color} bold>
          {LOGO_MINI}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {LOGO_LINES.map((line, i) => (
        <Text key={i} color={color} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
});