import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Model, ProviderId } from "../providers/types.js";
import { PROVIDER_LABELS } from "../config/models.js";
import { PROVIDER_ENV_VARS } from "../providers/registry.js";
import { LeftBorder } from "./LeftBorder.js";
import { useAppInput } from "./useAppInput.js";
import { isPrintableTextInput } from "./mouse.js";

interface ApiKeyPromptProps {
  theme: ThemeColors;
  provider: ProviderId;
  model: Model;
  contentWidth?: number;
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

function BlinkingCursor({ theme, visible }: { theme: ThemeColors; visible: boolean }) {
  if (!visible) return null;
  return <Text color={theme.primary}>▌</Text>;
}

export function ApiKeyPrompt({
  theme,
  provider,
  model,
  contentWidth = 72,
  onSubmit,
  onCancel,
}: ApiKeyPromptProps) {
  const [value, setValue] = useState("");
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useAppInput(
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

      if (input && !key.ctrl && !key.meta && isPrintableTextInput(input)) {
        setValue((v) => v + input);
      }
    },
    { isActive: true },
  );

  const envVars = PROVIDER_ENV_VARS[provider];
  const masked = "•".repeat(value.length);

  return (
    <Box flexDirection="column" marginTop={1} width={contentWidth}>
      <LeftBorder theme={theme} borderColor={theme.primary}>
        <Text color={theme.text} bold>
          API key required
        </Text>
        <Text color={theme.textMuted}>Enter save · Esc cancel</Text>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textMuted}>
            Provider: <Text color={theme.text}>{PROVIDER_LABELS[provider]}</Text>
          </Text>
          <Text color={theme.textMuted}>
            Model: <Text color={theme.text}>{model.name}</Text>
          </Text>
        </Box>

        <Box
          marginTop={1}
          flexDirection="column"
          width={contentWidth - 2}
          borderStyle="round"
          borderColor={theme.primary}
          paddingX={1}
          paddingY={1}
        >
          <Box flexDirection="row" minHeight={1}>
            {value.length > 0 ? (
              <Text color={theme.text}>
                {masked}
                <BlinkingCursor theme={theme} visible={cursorOn} />
              </Text>
            ) : (
              <Text color={theme.textMuted}>
                <BlinkingCursor theme={theme} visible={cursorOn} />
                Paste API key here…
              </Text>
            )}
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textMuted}>Or set env: {envVars.join(" · ")}</Text>
          <Text color={theme.textMuted}>Saved to ~/.agent-dev/settings.json</Text>
        </Box>
      </LeftBorder>
    </Box>
  );
}
