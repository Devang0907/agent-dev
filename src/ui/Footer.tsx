import React from "react";
import { Box, Text } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import type { OrchestratorMode } from "../config/settings.js";
import { modelRef } from "../config/models.js";
import type { UpdateInfo } from "../version/check.js";
import { UPDATE_COMMAND } from "../version/check.js";
import type { ContextUsageState } from "../agent/session.js";
import { formatTokenCount } from "../agent/compaction/tokens.js";

interface FooterProps {
  workdir: string;
  model: Model;
  theme: ThemeColors;
  scrollHint?: string;
  orchestratorMode?: OrchestratorMode;
  updateInfo?: UpdateInfo | null;
  contextUsage?: ContextUsageState;
}

function shortPath(path: string, max = 56): string {
  if (path.length <= max) return path;
  return "…" + path.slice(-(max - 1));
}

export function Footer({ workdir, model, theme, scrollHint, orchestratorMode, updateInfo, contextUsage }: FooterProps) {
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
          <Text color={theme.boss}>BOSS</Text>
        ) : null}
        {orchestratorMode === "boss" ? " · " : null}
        <Text color={theme.text}>{modelRef(model)}</Text>
        {contextUsage && contextUsage.tokens > 0 && (
          <>
            {"  "}
            <Text color={contextUsage.percent >= 85 ? theme.warning : theme.textMuted}>
              ctx {formatTokenCount(contextUsage.tokens)}/{formatTokenCount(contextUsage.window)}
            </Text>
          </>
        )}
        {scrollHint && (
          <>
            {"  "}
            <Text color={theme.warning}>{scrollHint}</Text>
          </>
        )}
        {updateInfo && (
          <>
            {"  "}
            <Text color={theme.warning}>↑ v{updateInfo.latest}</Text>
            <Text color={theme.textMuted}> · {UPDATE_COMMAND}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}
