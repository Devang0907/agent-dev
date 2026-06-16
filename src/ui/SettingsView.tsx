import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import type { ThinkingLevel } from "../providers/types.js";
import { PROVIDER_ENV_VARS } from "../providers/registry.js";
import type { ProviderId } from "../providers/types.js";
import { LeftBorder } from "./LeftBorder.js";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

interface SettingsViewProps {
  theme: ThemeColors;
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsView({ theme, settings, onUpdate, onClose }: SettingsViewProps) {
  const [index, setIndex] = useState(0);
  const items = ["thinkingLevel", "envKeys"];

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
      }
    }
  });

  const providers: ProviderId[] = ["openai", "groq", "gemini", "free"];

  return (
    <Box paddingX={2} marginTop={1}>
      <LeftBorder theme={theme} borderColor={theme.borderActive}>
        <Text color={theme.text} bold>/settings</Text>
        <Text color={theme.textMuted}> Enter cycle · Esc close</Text>

        <Box flexDirection="column" marginTop={1}>
          <Text color={index === 0 ? theme.primary : theme.text}>
            {index === 0 ? "› " : "  "}Thinking:{" "}
            <Text bold>{settings.thinkingLevel}</Text>
          </Text>

          <Box marginTop={1}>
            <Text color={index === 1 ? theme.primary : theme.textMuted}>
              {index === 1 ? "› " : "  "}API keys
            </Text>
          </Box>
          {providers.map((p) => {
            const vars = PROVIDER_ENV_VARS[p];
            const set = vars.some((v) => process.env[v]);
            return (
              <Text key={p} color={set ? theme.success : theme.textMuted}>
                {"    "}{set ? "✓" : "○"} {p}: {vars.join(" · ")}
              </Text>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text color={theme.textMuted}>
            OPENAI_API_KEY · GROQ_API_KEY · GEMINI_API_KEY · OPENROUTER_API_KEY
          </Text>
        </Box>
      </LeftBorder>
    </Box>
  );
}
