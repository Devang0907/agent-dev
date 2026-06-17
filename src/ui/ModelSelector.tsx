import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import { ALL_MODELS, modelRef, PROVIDER_LABELS } from "../config/models.js";
import { hasProviderAuth } from "../providers/registry.js";
import type { Settings } from "../config/settings.js";
import type { ProviderId } from "../providers/types.js";
import { LeftBorder } from "./LeftBorder.js";

interface ModelSelectorProps {
  theme: ThemeColors;
  settings: Settings;
  filter?: string;
  viewportHeight: number;
  onSelect: (model: Model) => void;
  onClose: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q);
}

export function ModelSelector({
  theme,
  settings,
  filter,
  viewportHeight,
  onSelect,
  onClose,
}: ModelSelectorProps) {
  const filtered = ALL_MODELS.filter((m) => {
    const label = `${PROVIDER_LABELS[m.provider]} ${m.name} ${modelRef(m)}`;
    return fuzzyMatch(label, filter ?? "");
  });

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, filtered.length - 1));

  useInput(
    (_, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setIndex((i) => Math.min(filtered.length - 1, i + 1));
      if (key.return && filtered[safeIndex]) {
        onSelect(filtered[safeIndex]);
      }
    },
    { isActive: true },
  );

  const providers: ProviderId[] = ["openai", "groq", "gemini", "free"];
  let lastProvider: ProviderId | undefined;

  const listHeight = Math.max(4, viewportHeight - 6);

  return (
    <Box
      flexDirection="column"
      height={viewportHeight}
      flexShrink={0}
      overflow="hidden"
      paddingX={2}
    >
      <LeftBorder theme={theme} borderColor={theme.borderActive}>
        <Text color={theme.text} bold>/model</Text>
        <Text color={theme.textMuted}> ↑↓ navigate · Enter select · Esc close</Text>
        <Text color={theme.textMuted}> Models without a key will prompt for an API key</Text>
        {filter && <Text color={theme.textMuted}> filter: {filter}</Text>}

        <Box flexDirection="column" marginTop={1} height={listHeight} overflow="hidden">
          {filtered.length === 0 && <Text color={theme.textMuted}>No models match</Text>}
          {filtered.map((m, i) => {
            const selected = i === safeIndex;
            const showHeader = m.provider !== lastProvider;
            lastProvider = m.provider;

            return (
              <Box key={modelRef(m)} flexDirection="column">
                {showHeader && (
                  <Box marginTop={1}>
                    <Text color={theme.textMuted}>{PROVIDER_LABELS[m.provider]}</Text>
                  </Box>
                )}
                <Text color={selected ? theme.primary : theme.text}>
                  {selected ? "› " : "  "}
                  {m.name}
                  {selected && <Text color={theme.textMuted}> {modelRef(m)}</Text>}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text color={theme.textMuted}>
            {providers.map((p) => {
              const ok = hasProviderAuth(p, settings);
              return `${ok ? "●" : "○"} ${p}`;
            }).join("  ")}
          </Text>
        </Box>
      </LeftBorder>
    </Box>
  );
}
