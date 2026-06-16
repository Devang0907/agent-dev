import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Model, ProviderId } from "../providers/types.js";
import { PROVIDER_LABELS } from "../config/models.js";
import { PROVIDER_ENV_VARS } from "../providers/registry.js";
import { LeftBorder } from "./LeftBorder.js";

interface ApiKeyPromptProps {
  theme: ThemeColors;
  provider: ProviderId;
  model: Model;
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

function BlinkingCursor({ theme, visible }: { theme: ThemeColors; visible: boolean }) {
  if (!visible) return null;
  return <Text color={theme.primary}>▌</Text>;
}

export function ApiKeyPrompt({ theme, provider, model, onSubmit, onCancel }: ApiKeyPromptProps) {
  const [value, setValue] = useState("");
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel();
        return;
      }

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
        return;
      }

      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setValue((v) => v + input);
      }
    },
    { isActive: true },
  );

  const envVars = PROVIDER_ENV_VARS[provider];
  const masked = "•".repeat(value.length);

  return (
    <Box flexDirection="column" marginX={2} marginTop={1} marginBottom={1}>
      <LeftBorder theme={theme} borderColor={theme.primary}>
        <Text color={theme.text} bold>API key required</Text>
        <Text color={theme.textMuted}> Enter save · Esc cancel</Text>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textMuted}>Provider: {PROVIDER_LABELS[provider]}</Text>
          <Text color={theme.textMuted}>Model: {model.name}</Text>
        </Box>

        <Box
          flexDirection="row"
          marginTop={1}
          borderStyle="round"
          borderColor={theme.primary}
          paddingX={1}
          paddingY={0}
        >
          {value.length > 0 ? (
            <>
              <Text color={theme.text}>{masked}</Text>
              <BlinkingCursor theme={theme} visible={cursorOn} />
            </>
          ) : (
            <>
              <Text color={theme.textMuted}>Paste API key here…</Text>
              <BlinkingCursor theme={theme} visible={cursorOn} />
            </>
          )}
        </Box>

        <Box marginTop={1}>
          <Text color={theme.textMuted}>Or set env: {envVars.join(" · ")}</Text>
          <Text color={theme.textMuted}>Saved to ~/.agent-dev/settings.json</Text>
        </Box>
      </LeftBorder>
    </Box>
  );
}
