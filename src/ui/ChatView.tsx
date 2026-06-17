import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { DisplayMessage } from "./App.js";
import type { ThemeColors } from "./theme.js";
import type { Model } from "../providers/types.js";
import { buildChatLines } from "./chat-lines.js";
import { chatContentWidth } from "./layout.js";

interface ChatViewProps {
  messages: DisplayMessage[];
  theme: ThemeColors;
  model: Model;
  streamingText?: string;
  running?: boolean;
  viewportHeight: number;
  scrollTop: number;
  contentWidth: number;
}

export function ChatView({
  messages,
  theme,
  model,
  streamingText,
  running,
  viewportHeight,
  scrollTop,
  contentWidth,
}: ChatViewProps) {
  const lines = useMemo(
    () =>
      buildChatLines(messages, {
        width: contentWidth,
        model,
        streamingText,
        running,
      }),
    [messages, contentWidth, model, streamingText, running],
  );

  if (lines.length === 0) {
    return null;
  }

  const visibleLines = lines.slice(scrollTop, scrollTop + viewportHeight);
  while (visibleLines.length < viewportHeight) {
    visibleLines.push({ id: `pad-${visibleLines.length}`, text: "", tone: "text" as const });
  }

  const toneColor = (tone: "text" | "textMuted" | "primary" | "warning") => theme[tone];

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      height={viewportHeight}
      overflow="hidden"
      paddingX={2}
    >
      {visibleLines.map((line) => (
        <Text key={line.id} color={toneColor(line.tone)}>
          {line.text || " "}
        </Text>
      ))}
    </Box>
  );
}
