import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import { ALL_MODELS, modelRef, PROVIDER_LABELS } from "../config/models.js";
import { hasProviderAuth } from "../providers/registry.js";
import type { Settings } from "../config/settings.js";
import type { ProviderId } from "../providers/types.js";

interface ModelSelectorProps {
  theme: ThemeColors;
  settings: Settings;
  filter?: string;
  onSelect: (model: Model) => void;
  onClose: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q) || modelRef({ provider: "openai", id: text, name: text }).includes(q);
}

export function ModelSelector({ theme, settings, filter, onSelect, onClose }: ModelSelectorProps) {
  const filtered = ALL_MODELS.filter((m) => {
    const label = `${PROVIDER_LABELS[m.provider]} ${m.name} ${modelRef(m)}`;
    return fuzzyMatch(label, filter ?? "");
  });

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(filtered.length - 1, i + 1));
    if (key.return && filtered[safeIndex]) {
      onSelect(filtered[safeIndex]);
    }
    if (input && !key.ctrl) {
      // typing not used in overlay mode
    }
  });

  const providers: ProviderId[] = ["openai", "groq", "gemini", "free"];

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.accent} padding={1}>
      <Text color={theme.header} bold>/model — select provider & model (Esc to close)</Text>
      {filter && <Text color={theme.muted}>Filter: {filter}</Text>}
      <Box flexDirection="column" marginTop={1}>
        {filtered.length === 0 && <Text color={theme.muted}>No models match</Text>}
        {filtered.map((m, i) => {
          const hasKey = hasProviderAuth(m.provider, settings);
          const selected = i === safeIndex;
          return (
            <Text key={modelRef(m)} color={selected ? theme.accent : theme.assistant}>
              {selected ? "> " : "  "}
              [{PROVIDER_LABELS[m.provider]}] {m.name}
              {!hasKey ? " (no key)" : ""}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          Providers: {providers.map((p) => `${PROVIDER_LABELS[p]}${hasProviderAuth(p, settings) ? "" : " (no key)"}`).join(" | ")}
        </Text>
      </Box>
    </Box>
  );
}
