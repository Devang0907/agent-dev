import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { InteractionRequest } from "../agent/loop.js";
import { LeftBorder } from "./LeftBorder.js";

interface BrowserInteractionPromptProps {
  theme: ThemeColors;
  request: InteractionRequest;
  onContinue: (value?: string) => void;
}

export function BrowserInteractionPrompt({
  theme,
  request,
  onContinue,
}: BrowserInteractionPromptProps) {
  const [input, setInput] = useState("");

  useInput(
    (char, key) => {
      if (request.kind === "manual_step") {
        if (key.return) {
          onContinue();
        } else if (key.escape) {
          onContinue();
        }
        return;
      }

      if (key.return) {
        onContinue(input.trim() || undefined);
        return;
      }
      if (key.escape) {
        onContinue();
        return;
      }
      if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
        return;
      }
      if (char && !key.ctrl && !key.meta) {
        setInput((prev) => prev + char);
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginX={2} marginTop={1} marginBottom={1}>
      <LeftBorder theme={theme} borderColor={theme.primary}>
        <Text color={theme.text} bold>
          {request.kind === "manual_step" ? "Browser action required" : "Input required"}
        </Text>
        <Text color={theme.textMuted}>
          {request.kind === "manual_step"
            ? " Complete the step in the browser window, then press Enter"
            : " Type your response and press Enter · Esc to skip"}
        </Text>

        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={theme.primary}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.text}>{request.reason}</Text>
          {request.kind === "user_input" ? (
            <Box marginTop={1}>
              <Text color={theme.textMuted}>
                {request.placeholder ?? "Enter value"}:{" "}
              </Text>
              <Text color={theme.text}>{input}</Text>
              <Text color={theme.textMuted}>▌</Text>
            </Box>
          ) : null}
        </Box>
      </LeftBorder>
    </Box>
  );
}
