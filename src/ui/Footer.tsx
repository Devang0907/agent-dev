import React from "react";
import { Box, Text } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import { modelRef } from "../config/models.js";

interface FooterProps {
  workdir: string;
  model: Model;
  theme: ThemeColors;
}

function shortPath(path: string, max = 56): string {
  if (path.length <= max) return path;
  return "…" + path.slice(-(max - 1));
}

export function Footer({ workdir, model, theme }: FooterProps) {
  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      paddingX={2}
      marginBottom={1}
    >
      <Text color={theme.textMuted}>
        <Text color={theme.primary}>⌂ </Text>
        {shortPath(workdir)}
        {"  "}
        <Text color={theme.text}>{modelRef(model)}</Text>
      </Text>
    </Box>
  );
}
