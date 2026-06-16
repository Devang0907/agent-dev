import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import type { ThinkingLevel, ProviderId } from "../providers/types.js";
import { PROVIDER_ENV_VARS, hasProviderAuth } from "../providers/registry.js";
import { LeftBorder } from "./LeftBorder.js";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const PROVIDERS: ProviderId[] = ["openai", "groq", "gemini", "free"];

interface SettingsViewProps {
  theme: ThemeColors;
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onSetApiKey: (provider: ProviderId) => void;
  onClose: () => void;
}

export function SettingsView({ theme, settings, onUpdate, onSetApiKey, onClose }: SettingsViewProps) {
  const items = ["thinkingLevel", ...PROVIDERS];
  const [index, setIndex] = useState(0);

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
    <Box paddingX={2} marginTop={1} marginBottom={1}>
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
            <Text color={theme.textMuted}>API keys — Enter to set / update</Text>
          </Box>
          {PROVIDERS.map((p, i) => {
            const idx = i + 1;
            const vars = PROVIDER_ENV_VARS[p];
            const fromEnv = vars.some((v) => !!process.env[v]);
            const fromSettings = !!settings.apiKeys?.[p];
            const ok = hasProviderAuth(p, settings);
            return (
              <Text key={p} color={index === idx ? theme.primary : theme.text}>
                {index === idx ? "› " : "  "}
                {ok ? "✓" : "○"} {p}
                {fromEnv && <Text color={theme.textMuted}> env</Text>}
                {fromSettings && <Text color={theme.textMuted}> saved</Text>}
              </Text>
            );
          })}
        </Box>
      </LeftBorder>
    </Box>
  );
}
