import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import type { ThinkingLevel, Theme } from "../providers/types.js";
import { PROVIDER_ENV_VARS } from "../providers/registry.js";
import type { ProviderId } from "../providers/types.js";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
const THEMES: Theme[] = ["dark", "light"];

interface SettingsViewProps {
  theme: ThemeColors;
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsView({ theme, settings, onUpdate, onClose }: SettingsViewProps) {
  const [index, setIndex] = useState(0);
  const items = ["thinkingLevel", "theme", "envKeys"];

  useInput((_, key) => {
    if (key.escape) onClose();
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(items.length - 1, i + 1));
    if (key.return) {
      const item = items[index];
      if (item === "thinkingLevel") {
        const cur = THINKING_LEVELS.indexOf(settings.thinkingLevel);
        const next = THINKING_LEVELS[(cur + 1) % THINKING_LEVELS.length];
        onUpdate({ ...settings, thinkingLevel: next });
      } else if (item === "theme") {
        const cur = THEMES.indexOf(settings.theme);
        const next = THEMES[(cur + 1) % THEMES.length];
        onUpdate({ ...settings, theme: next });
      }
    }
  });

  const providers: ProviderId[] = ["openai", "groq", "gemini", "free"];

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.accent} padding={1}>
      <Text color={theme.header} bold>/settings (Enter to cycle, Esc to close)</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={index === 0 ? theme.accent : theme.assistant}>
          {index === 0 ? "> " : "  "}Thinking level: {settings.thinkingLevel}
        </Text>
        <Text color={index === 1 ? theme.accent : theme.assistant}>
          {index === 1 ? "> " : "  "}Theme: {settings.theme}
        </Text>
        <Text color={index === 2 ? theme.accent : theme.muted}>
          {index === 2 ? "> " : "  "}API keys (env vars):
        </Text>
        {providers.map((p) => {
          const vars = PROVIDER_ENV_VARS[p];
          const set = vars.some((v) => process.env[v]);
          return (
            <Text key={p} color={theme.muted}>
              {"    "}{p}: {vars.join(" or ")} — {set ? "set" : "not set"}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          Set OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
        </Text>
      </Box>
    </Box>
  );
}
