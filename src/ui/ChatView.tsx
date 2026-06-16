import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { DisplayMessage } from "./App.js";
import type { ThemeColors } from "./theme.js";
import { SPINNER_FRAMES, TOOL_ICONS } from "./theme.js";
import { LeftBorder } from "./LeftBorder.js";
import { Panel } from "./Panel.js";
import { modelRef } from "../config/models.js";
import type { Model } from "../providers/types.js";

interface ChatViewProps {
  messages: DisplayMessage[];
  theme: ThemeColors;
  model: Model;
  streamingText?: string;
  running?: boolean;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function ChatView({ messages, theme, model, streamingText, running }: ChatViewProps) {
  const [spinIdx, setSpinIdx] = useState(0);
  const hasContent =
    messages.length > 0 || (streamingText?.length ?? 0) > 0;

  useEffect(() => {
    if (!running && !streamingText) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [running, streamingText]);

  if (!hasContent) {
    return null;
  }

  return (
    <Panel theme={theme} flexGrow={1} borderColor={theme.border}>
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          {msg.role === "user" && (
            <LeftBorder theme={theme} borderColor={theme.primary} marginBottom={0}>
              <Text color={theme.text}>{msg.content}</Text>
            </LeftBorder>
          )}

          {msg.role === "assistant" && (
            <Box flexDirection="column" paddingLeft={1}>
              <Text color={theme.text}>{msg.content || ""}</Text>
              <Text color={theme.textMuted}>
                <Text color={theme.primary}>▣ </Text>
                {modelRef(model)}
              </Text>
            </Box>
          )}

          {msg.role === "tool" && (
            <Box paddingLeft={1}>
              <Text color={theme.text}>
                <Text color={theme.textMuted}>
                  {TOOL_ICONS[msg.toolName ?? ""] ?? "⚙"}
                </Text>
                {" "}
                <Text bold>{msg.toolName}</Text>
                <Text color={theme.textMuted}> {truncate(msg.content, 200)}</Text>
              </Text>
            </Box>
          )}
        </Box>
      ))}

      {streamingText && (
        <Box flexDirection="column" paddingLeft={1}>
          <Text color={theme.text}>{streamingText}</Text>
          <Text color={theme.textMuted}>
            <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]} </Text>
            responding…
          </Text>
        </Box>
      )}

      {running && !streamingText && messages.length > 0 && (
        <Box paddingLeft={1}>
          <Text color={theme.textMuted}>
            <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]}</Text> working…
          </Text>
        </Box>
      )}
    </Panel>
  );
}
