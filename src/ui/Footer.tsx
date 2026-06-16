import React from "react";
import { Box, Text } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import { modelRef } from "../config/models.js";

interface FooterProps {
  workdir: string;
  model: Model;
  theme: ThemeColors;
  running: boolean;
}

export function Footer({ workdir, model, theme, running }: FooterProps) {
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
      <Text color={theme.muted}>
        {workdir} | {modelRef(model)} {running ? "| working..." : ""}
      </Text>
    </Box>
  );
}
