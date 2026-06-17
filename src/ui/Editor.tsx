import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Model } from "../providers/types.js";
import { modelRef } from "../config/models.js";
import {
  matchSlashCommands,
  completeSlashInput,
  SLASH_COMMANDS,
} from "./slash-commands.js";
import { Panel } from "./Panel.js";
import { SPINNER_FRAMES } from "./theme.js";
import { useAppInput } from "./useAppInput.js";
import { isPrintableTextInput } from "./mouse.js";

interface EditorProps {
  theme: ThemeColors;
  model: Model;
  disabled?: boolean;
  running?: boolean;
  onSubmit: (value: string) => void;
}

function BlinkingCursor({ theme, visible }: { theme: ThemeColors; visible: boolean }) {
  if (!visible) return null;
  return <Text color={theme.primary}>▌</Text>;
}

export function Editor({ theme, model, disabled, running, onSubmit }: EditorProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<typeof SLASH_COMMANDS[number][]>([]);
  const [spinIdx, setSpinIdx] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (disabled) return;
    const id = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(id);
  }, [disabled]);

  const updateSuggestions = (text: string) => {
    if (text.startsWith("/")) {
      setSuggestions(matchSlashCommands(text));
    } else {
      setSuggestions([]);
    }
  };

  useAppInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
        setValue("");
        setSuggestions([]);
        return;
      }

      if (key.tab) {
        if (value.startsWith("/")) {
          const completed = completeSlashInput(value);
          if (completed) {
            setValue(completed);
            setSuggestions(matchSlashCommands(completed));
          } else if (suggestions.length > 0) {
            setValue(suggestions[0].cmd);
            setSuggestions(matchSlashCommands(suggestions[0].cmd));
          }
        }
        return;
      }

      if (key.backspace || key.delete) {
        const newVal = value.slice(0, -1);
        setValue(newVal);
        updateSuggestions(newVal);
        return;
      }

      if (input && !key.ctrl && !key.meta && isPrintableTextInput(input)) {
        const newVal = value + input;
        setValue(newVal);
        updateSuggestions(newVal);
      }
    },
    { isActive: !disabled },
  );

  const placeholder = "Ask anything…";
  const showCursor = !disabled && cursorOn;

  return (
    <Box flexDirection="column" marginX={2}>
      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.border}
          paddingX={1}
          marginBottom={1}
        >
          {suggestions.map((s) => (
            <Text key={s.cmd}>
              <Text color={theme.primary}>{s.cmd}</Text>
              <Text color={theme.textMuted}> — {s.desc}</Text>
            </Text>
          ))}
        </Box>
      )}

      <Panel theme={theme} borderColor={disabled ? theme.border : theme.primary} marginBottom={0}>
        <Box flexDirection="row">
          {value.length > 0 ? (
            <>
              <Text color={theme.text}>{value}</Text>
              <BlinkingCursor theme={theme} visible={showCursor} />
            </>
          ) : (
            <>
              <BlinkingCursor theme={theme} visible={showCursor} />
              <Text color={theme.textMuted}>{placeholder}</Text>
            </>
          )}
        </Box>
        <Text color={theme.textMuted}>
          agent-dev · <Text color={theme.text}>{modelRef(model)}</Text>
        </Text>
      </Panel>

        <Box marginTop={1} marginBottom={1}>
          {running ? (
            <Text color={theme.textMuted}>
              <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]}</Text>
              {" "}esc interrupt
            </Text>
          ) : (
            <Text color={theme.textMuted}>
              Tab completes /commands · ↑↓ wheel scroll · Ctrl+G latest
            </Text>
          )}
        </Box>
    </Box>
  );
}
