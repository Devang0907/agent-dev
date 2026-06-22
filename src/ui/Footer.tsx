import React from "react";
import { Box, Text } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import type { OrchestratorMode } from "../config/settings.js";
import { modelRef } from "../config/models.js";

interface FooterProps {
  workdir: string;
  model: Model;
  theme: ThemeColors;
  scrollHint?: string;
  orchestratorMode?: OrchestratorMode;
}

function shortPath(path: string, max = 56): string {
  if (path.length <= max) return path;
  return "…" + path.slice(-(max - 1));
}

export function Footer({ workdir, model, theme, scrollHint, orchestratorMode }: FooterProps) {
  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      paddingX={2}
      marginBottom={1}
      flexShrink={0}
    >
        <Text color={theme.textMuted}>
        <Text color={theme.primary}>⌂ </Text>
        {shortPath(workdir)}
        {"  "}
        {orchestratorMode === "boss" ? (
          <Text color={theme.warning}>BOSS</Text>
        ) : null}
        {orchestratorMode === "boss" ? " · " : null}
        <Text color={theme.text}>{modelRef(model)}</Text>
        {scrollHint && (
          <>
            {"  "}
            <Text color={theme.warning}>{scrollHint}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}
