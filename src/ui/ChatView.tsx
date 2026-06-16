import React from "react";
import { Box, Text } from "ink";
import type { DisplayMessage } from "./App.js";
import type { ThemeColors } from "./theme.js";

interface ChatViewProps {
  messages: DisplayMessage[];
  theme: ThemeColors;
  streamingText?: string;
}

export function ChatView({ messages, theme, streamingText }: ChatViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1} marginBottom={1}>
      {messages.length === 0 && !streamingText && (
        <Text color={theme.muted}>Type a message or /model to select a provider. /settings for options.</Text>
      )}
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          {msg.role === "user" && (
            <Text color={theme.user} bold>
              You: {msg.content}
            </Text>
          )}
          {msg.role === "assistant" && (
            <Box flexDirection="column">
              <Text color={theme.assistant} bold>Assistant:</Text>
              <Text color={theme.assistant}>{msg.content || ""}</Text>
            </Box>
          )}
          {msg.role === "tool" && (
            <Box flexDirection="column">
              <Text color={theme.tool}>
                [{msg.toolName}] {msg.content.slice(0, 200)}{msg.content.length > 200 ? "..." : ""}
              </Text>
            </Box>
          )}
        </Box>
      ))}
      {streamingText && (
        <Box flexDirection="column">
          <Text color={theme.assistant} bold>Assistant:</Text>
          <Text color={theme.assistant}>{streamingText}</Text>
        </Box>
      )}
    </Box>
  );
}
