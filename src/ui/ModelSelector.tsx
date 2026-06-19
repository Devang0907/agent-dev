import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Model } from "../providers/types.js";
import type { ThemeColors } from "./theme.js";
import { ALL_MODELS, modelRef, PROVIDER_LABELS } from "../config/models.js";
import { hasProviderAuth } from "../providers/registry.js";
import type { Settings } from "../config/settings.js";
import { LeftBorder } from "./LeftBorder.js";
import { clamp } from "./scroll.js";

interface ModelSelectorProps {
  theme: ThemeColors;
  settings: Settings;
  filter?: string;
  viewportHeight: number;
  contentWidth: number;
  onSelect: (model: Model) => void;
  onClose: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q);
}

function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

const HEADER_ROWS = 5;

export function ModelSelector({
  theme,
  settings,
  filter,
  viewportHeight,
  contentWidth,
  onSelect,
  onClose,
}: ModelSelectorProps) {
  const filtered = ALL_MODELS.filter((m) => {
    const label = `${PROVIDER_LABELS[m.provider]} ${m.name} ${modelRef(m)}`;
    return fuzzyMatch(label, filter ?? "");
  });

  const [index, setIndex] = useState(0);
  const [listScroll, setListScroll] = useState(0);

  const safeIndex = Math.min(index, Math.max(0, filtered.length - 1));
  const listHeight = Math.max(4, viewportHeight - HEADER_ROWS - 3);
  const maxListScroll = Math.max(0, filtered.length - listHeight);

  useEffect(() => {
    setIndex(0);
    setListScroll(0);
  }, [filter]);

  useEffect(() => {
    setListScroll((prev) => {
      if (safeIndex < prev) return safeIndex;
      if (safeIndex >= prev + listHeight) return safeIndex - listHeight + 1;
      return clamp(prev, 0, maxListScroll);
    });
  }, [safeIndex, listHeight, maxListScroll]);

  useInput(
    (_, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow || key.pageUp) {
        setIndex((i) => Math.max(0, i - (key.pageUp ? 5 : 1)));
        return;
      }
      if (key.downArrow || key.pageDown) {
        setIndex((i) => Math.min(filtered.length - 1, i + (key.pageDown ? 5 : 1)));
        return;
      }
      if (key.return && filtered[safeIndex]) {
        onSelect(filtered[safeIndex]);
      }
    },
    { isActive: true },
  );

  const nameWidth = Math.max(20, Math.floor(contentWidth * 0.42));
  const refWidth = Math.max(24, contentWidth - nameWidth - 6);
  const visible = filtered.slice(listScroll, listScroll + listHeight);

  return (
    <Box flexDirection="column" height={viewportHeight} flexShrink={0} overflow="hidden" paddingX={2}>
      <LeftBorder theme={theme} borderColor={theme.borderActive}>
        <Box flexDirection="column" width={contentWidth}>
          <Text color={theme.text} bold>
            /model
          </Text>
          <Text color={theme.textMuted}>↑↓ navigate · Enter select · Esc close</Text>
          <Text color={theme.textMuted}>
            Models without a key will prompt for an API key
            {filtered.length > 0 && (
              <>
                {" "}
                · {safeIndex + 1}/{filtered.length}
              </>
            )}
          </Text>
          {filter && (
            <Text color={theme.textMuted}>
              filter: <Text color={theme.text}>{filter}</Text>
            </Text>
          )}

          <Box
            marginTop={1}
            flexDirection="column"
            width={contentWidth - 2}
            borderStyle="round"
            borderColor={theme.borderActive}
            paddingX={1}
            paddingY={0}
          >
            <Box flexDirection="column" height={listHeight} overflow="hidden">
              {filtered.length === 0 && (
                <Text color={theme.textMuted}>No models match this filter.</Text>
              )}
              {visible.map((m, row) => {
                const i = listScroll + row;
                const selected = i === safeIndex;
                const configured = hasProviderAuth(m.provider, settings);
                const marker = configured ? "●" : "○";
                const name = truncate(m.name, nameWidth - 4).padEnd(nameWidth - 4);
                const ref = truncate(modelRef(m), refWidth);

                return (
                  <Text key={modelRef(m)} color={selected ? theme.primary : theme.text}>
                    {selected ? "› " : "  "}
                    <Text color={configured ? theme.text : theme.warning}>{marker} </Text>
                    {name}
                    <Text color={theme.textMuted}> {ref}</Text>
                  </Text>
                );
              })}
            </Box>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.textMuted}>● configured · ○ needs API key · Enter to select</Text>
            <Text color={theme.textMuted}>
              Tip: type <Text color={theme.text}>/model groq</Text> to filter before opening
            </Text>
          </Box>
        </Box>
      </LeftBorder>
    </Box>
  );
}
