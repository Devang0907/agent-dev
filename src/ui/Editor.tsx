import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";

const SLASH_COMMANDS = ["/model", "/settings", "/new", "/quit"];

interface EditorProps {
  theme: ThemeColors;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  filterHint?: string;
}

export function Editor({ theme, disabled, onSubmit, filterHint }: EditorProps) {
  const [value, setValue] = useState(filterHint ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      setValue("");
      setSuggestions([]);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const newVal = value + input;
      setValue(newVal);
      if (newVal.startsWith("/")) {
        setSuggestions(SLASH_COMMANDS.filter((c) => c.startsWith(newVal)));
      } else {
        setSuggestions([]);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      {suggestions.length > 0 && (
        <Text color={theme.muted}>{suggestions.join("  ")}</Text>
      )}
      <Text>
        <Text color={theme.accent}>{"> "}</Text>
        <Text>{value}</Text>
        <Text color={theme.muted}>█</Text>
      </Text>
    </Box>
  );
}
