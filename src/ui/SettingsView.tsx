import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import { getCompactionSettings, DEFAULT_COMPACTION_SETTINGS } from "../config/settings.js";
import type { ThinkingLevel, ProviderId } from "../providers/types.js";
import { PROVIDER_ENV_VARS, hasProviderAuth } from "../providers/registry.js";
import { LeftBorder } from "./LeftBorder.js";
import { loadMergedPermissionRules, countPermissionRules } from "../agent/permissions.js";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const PROVIDERS: ProviderId[] = ["openai", "anthropic", "groq", "gemini", "free"];

interface SettingsViewProps {
  theme: ThemeColors;
  settings: Settings;
  workdir: string;
  viewportHeight: number;
  contentWidth: number;
  onUpdate: (settings: Settings) => void;
  onSetApiKey: (provider: ProviderId) => void;
  onClose: () => void;
}

function providerStatus(
  provider: ProviderId,
  settings: Settings,
): string {
  const fromEnv = PROVIDER_ENV_VARS[provider].some((v) => !!process.env[v]);
  const fromSettings = !!settings.apiKeys?.[provider];
  const parts: string[] = [];
  if (fromEnv) parts.push("env");
  if (fromSettings) parts.push("saved");
  if (parts.length === 0) parts.push("Enter to set");
  return parts.join(" · ");
}

function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function SettingsView({
  theme,
  settings,
  workdir,
  viewportHeight,
  contentWidth,
  onUpdate,
  onSetApiKey,
  onClose,
}: SettingsViewProps) {
  const compaction = getCompactionSettings(settings);
  const permissionCounts = countPermissionRules(loadMergedPermissionRules(workdir, settings));
  const permissionSummary = (["bash", "git", "database", "mcp", "browser"] as const)
    .filter((c) => permissionCounts[c] > 0)
    .map((c) => `${c}: ${permissionCounts[c]} rules`)
    .join(" · ");
  const items = ["thinkingLevel", "compaction", ...PROVIDERS];
  const [index, setIndex] = useState(0);

  const providerColWidth = 16;
  const statusWidth = Math.max(18, contentWidth - providerColWidth);

  useInput(
    (_, key) => {
      if (key.escape) onClose();
      if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setIndex((i) => Math.min(items.length - 1, i + 1));
      if (key.return) {
        const item = items[index];
        if (item === "thinkingLevel") {
          const cur = THINKING_LEVELS.indexOf(settings.thinkingLevel);
          const next = THINKING_LEVELS[(cur + 1) % THINKING_LEVELS.length];
          onUpdate({ ...settings, thinkingLevel: next });
        } else if (item === "compaction") {
          const enabled = !(compaction.enabled ?? DEFAULT_COMPACTION_SETTINGS.enabled);
          onUpdate({
            ...settings,
            compaction: { ...compaction, enabled },
          });
        } else {
          onSetApiKey(item as ProviderId);
        }
      }
    },
    { isActive: true },
  );

  return (
    <Box
      flexDirection="column"
      height={viewportHeight}
      flexShrink={0}
      overflow="hidden"
      paddingX={2}
    >
      <LeftBorder theme={theme} borderColor={theme.borderActive}>
        <Text color={theme.text} bold>/settings</Text>
        <Text color={theme.textMuted}> ↑↓ navigate · Enter select · Esc close</Text>

        <Box flexDirection="column" marginTop={1}>
          <Text color={index === 0 ? theme.primary : theme.text}>
            {index === 0 ? "› " : "  "}Thinking:{" "}
            <Text bold>{settings.thinkingLevel}</Text>
            {index === 0 && <Text color={theme.textMuted}> (Enter to cycle)</Text>}
          </Text>
          <Text color={theme.textMuted}>
            {"  "}Applies to Claude, OpenAI o-series, Gemini 2.5+; ignored elsewhere
          </Text>

          <Text color={index === 1 ? theme.primary : theme.text}>
            {index === 1 ? "› " : "  "}Auto-compact:{" "}
            <Text bold>{compaction.enabled ? "on" : "off"}</Text>
            {index === 1 && <Text color={theme.textMuted}> (Enter to toggle)</Text>}
          </Text>
          <Text color={theme.textMuted}>
            {"  "}reserve {compaction.reserveTokens?.toLocaleString()} · keep{" "}
            {compaction.keepRecentTokens?.toLocaleString()} tokens
          </Text>

          <Box marginTop={1}>
            <Text color={theme.textMuted}>Permission presets</Text>
          </Box>
          <Text color={theme.textMuted}>
            {"  "}
            {permissionSummary || "none configured (gated tools default to ask)"}
          </Text>
          <Text color={theme.textMuted}>
            {"  "}Edit ~/.agent-dev/settings.json or .agent-dev/permissions.json · /permissions
          </Text>

          <Box marginTop={1}>
            <Text color={theme.textMuted}>API keys</Text>
          </Box>
          {PROVIDERS.map((p, i) => {
            const idx = i + 2;
            const ok = hasProviderAuth(p, settings);
            const selected = index === idx;
            const label = truncate(
              `${selected ? "› " : "  "}${ok ? "✓" : "○"} ${p}`,
              providerColWidth,
            ).padEnd(providerColWidth);
            const status = truncate(providerStatus(p, settings), statusWidth).padEnd(statusWidth);
            return (
              <Text key={p} color={selected ? theme.primary : theme.text}>
                {label}
                <Text color={theme.textMuted}>{status}</Text>
              </Text>
            );
          })}
        </Box>
      </LeftBorder>
    </Box>
  );
}
