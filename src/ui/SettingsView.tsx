import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import type { ThinkingLevel, ProviderId } from "../providers/types.js";
import { PROVIDER_ENV_VARS, hasProviderAuth } from "../providers/registry.js";
import { LeftBorder } from "./LeftBorder.js";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const PROVIDERS: ProviderId[] = ["openai", "anthropic", "groq", "gemini", "free"];

interface SettingsViewProps {
  theme: ThemeColors;
  settings: Settings;
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
  viewportHeight,
  contentWidth,
  onUpdate,
  onSetApiKey,
  onClose,
}: SettingsViewProps) {
  const items = ["thinkingLevel", ...PROVIDERS];
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

          <Box marginTop={1}>
            <Text color={theme.textMuted}>API keys</Text>
          </Box>
          {PROVIDERS.map((p, i) => {
            const idx = i + 1;
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
