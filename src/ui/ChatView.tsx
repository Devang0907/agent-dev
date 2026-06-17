import React, { useEffect, useState } from "react";
import { Box, Static, Text } from "ink";
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
  autoFollow?: boolean;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function StaticMessage({
  msg,
  theme,
  model,
}: {
  msg: DisplayMessage;
  theme: ThemeColors;
  model: Model;
}) {
  if (msg.role === "user") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <LeftBorder theme={theme} borderColor={theme.primary} marginBottom={0}>
          <Text color={theme.text}>{msg.content}</Text>
        </LeftBorder>
      </Box>
    );
  }

  if (msg.role === "assistant") {
    return (
      <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
        <Text color={theme.text}>{msg.content || ""}</Text>
        <Text color={theme.textMuted}>
          <Text color={theme.primary}>▣ </Text>
          {modelRef(model)}
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingLeft={1} marginBottom={1}>
      <Text color={theme.text}>
        <Text color={theme.textMuted}>{TOOL_ICONS[msg.toolName ?? ""] ?? "⚙"}</Text>
        {" "}
        <Text bold>{msg.toolName}</Text>
        <Text color={theme.textMuted}> {truncate(msg.content, 500)}</Text>
      </Text>
    </Box>
  );
}

export function ChatView({
  messages,
  theme,
  model,
  streamingText,
  running,
  autoFollow = true,
}: ChatViewProps) {
  const [spinIdx, setSpinIdx] = useState(0);
  const hasContent = messages.length > 0 || (streamingText?.length ?? 0) > 0;

  useEffect(() => {
    if (!running && !streamingText) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [running, streamingText]);

  if (!hasContent) {
    return null;
  }

  const showWorking = running && !streamingText && messages.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Static items={messages}>
        {(msg) => (
          <StaticMessage key={msg.id} msg={msg} theme={theme} model={model} />
        )}
      </Static>

      {(streamingText || showWorking) && (
        <Panel theme={theme} borderColor={theme.border} marginBottom={1}>
          {streamingText && (
            <Box flexDirection="column" paddingLeft={1}>
              <Text color={theme.text}>{streamingText}</Text>
              <Text color={theme.textMuted}>
                <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]} </Text>
                responding…
                {!autoFollow && (
                  <Text color={theme.warning}> · paused (Ctrl+G to follow)</Text>
                )}
              </Text>
            </Box>
          )}

          {showWorking && (
            <Box paddingLeft={1}>
              <Text color={theme.textMuted}>
                <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]}</Text> working…
              </Text>
            </Box>
          )}
        </Panel>
      )}
    </Box>
  );
}
