import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Model } from "../providers/types.js";
import { modelRef } from "../config/models.js";
import {
  completeInput,
  formatOneLineDescription,
  getInputSuggestions,
  type InputSuggestion,
  type SkillNameOption,
} from "./slash-commands.js";
import { Panel } from "./Panel.js";
import { SPINNER_FRAMES } from "./theme.js";
import { useAppInput } from "./useAppInput.js";
import { isPrintableTextInput } from "./mouse.js";
import { useMouseScroll } from "./useMouseScroll.js";
import { WHEEL_SCROLL_LINES } from "./mouse.js";
import { clamp, SUGGESTION_PICKER_VISIBLE } from "./scroll.js";

interface EditorProps {
  theme: ThemeColors;
  model: Model;
  skills?: SkillNameOption[];
  contentWidth?: number;
  disabled?: boolean;
  running?: boolean;
  onSuggestionsOpenChange?: (open: boolean) => void;
  onSubmit: (value: string) => void;
}

function BlinkingCursor({ theme, visible }: { theme: ThemeColors; visible: boolean }) {
  if (!visible) return null;
  return <Text color={theme.primary}>▌</Text>;
}

function truncateLine(line: string, max: number): string {
  if (max <= 1 || line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function applySuggestion(suggestion: InputSuggestion, isSkillCmd: boolean): string {
  return isSkillCmd ? `${suggestion.cmd} ` : suggestion.cmd;
}

export function Editor({
  theme,
  model,
  skills = [],
  contentWidth = 72,
  disabled,
  running,
  onSuggestionsOpenChange,
  onSubmit,
}: EditorProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [suggestions, setSuggestions] = useState<InputSuggestion[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerScroll, setPickerScroll] = useState(0);
  const [spinIdx, setSpinIdx] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  const skillList = useMemo(() => skills, [skills]);
  const isSkillPicker = value === "/skill" || value.startsWith("/skill ");
  const pickerOpen = suggestions.length > 0;

  useEffect(() => {
    onSuggestionsOpenChange?.(pickerOpen);
    return () => onSuggestionsOpenChange?.(false);
  }, [pickerOpen, onSuggestionsOpenChange]);

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

  const safePickerIndex = Math.min(pickerIndex, Math.max(0, suggestions.length - 1));
  const maxPickerScroll = Math.max(0, suggestions.length - SUGGESTION_PICKER_VISIBLE);

  const suggestionKey = suggestions.map((s) => s.cmd).join("\0");

  useEffect(() => {
    setPickerIndex(0);
    setPickerScroll(0);
  }, [suggestionKey]);

  useEffect(() => {
    setPickerIndex((i) => Math.min(i, Math.max(0, suggestions.length - 1)));
  }, [suggestions.length]);

  useEffect(() => {
    setPickerScroll((prev) => {
      if (safePickerIndex < prev) return safePickerIndex;
      if (safePickerIndex >= prev + SUGGESTION_PICKER_VISIBLE) {
        return safePickerIndex - SUGGESTION_PICKER_VISIBLE + 1;
      }
      return clamp(prev, 0, maxPickerScroll);
    });
  }, [safePickerIndex, maxPickerScroll]);

  useEffect(() => {
    setCursorPos((pos) => Math.min(pos, value.length));
  }, [value.length]);

  const updateSuggestions = useCallback(
    (text: string) => {
      setSuggestions(getInputSuggestions(text, skillList));
    },
    [skillList],
  );

  const setValueAndCursor = useCallback((next: string, nextCursor: number) => {
    setValue(next);
    setCursorPos(Math.max(0, Math.min(nextCursor, next.length)));
    updateSuggestions(next);
  }, [updateSuggestions]);

  const insertAtCursor = useCallback(
    (text: string) => {
      const next = value.slice(0, cursorPos) + text + value.slice(cursorPos);
      setValueAndCursor(next, cursorPos + text.length);
    },
    [value, cursorPos, setValueAndCursor],
  );

  const deleteBeforeCursor = useCallback(() => {
    if (cursorPos === 0) return;
    const next = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
    setValueAndCursor(next, cursorPos - 1);
  }, [value, cursorPos, setValueAndCursor]);

  const deleteAtCursor = useCallback(() => {
    if (cursorPos >= value.length) return;
    const next = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
    setValueAndCursor(next, cursorPos);
  }, [value, cursorPos, setValueAndCursor]);

  const fillSelected = useCallback(
    (index: number) => {
      const pick = suggestions[index];
      if (!pick) return;
      const next = applySuggestion(pick, isSkillPicker);
      setValueAndCursor(next, next.length);
    },
    [suggestions, isSkillPicker, setValueAndCursor],
  );

  const movePicker = useCallback(
    (delta: number) => {
      if (suggestions.length === 0) return;
      setPickerIndex((i) => clamp(i + delta, 0, suggestions.length - 1));
    },
    [suggestions.length],
  );

  useMouseScroll(
    (direction) => {
      if (!pickerOpen) return;
      movePicker(direction === "up" ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES);
    },
    { isActive: pickerOpen && !disabled },
  );

  useAppInput(
    (input, key) => {
      if (disabled) return;

      if (pickerOpen && (key.upArrow || key.downArrow)) {
        movePicker(key.upArrow ? -1 : 1);
        return;
      }

      if (key.return) {
        if (key.shift) {
          insertAtCursor("\n");
          return;
        }
        if (isSkillPicker && pickerOpen) {
          const pick = suggestions[safePickerIndex];
          if (pick) {
            onSubmit(pick.cmd);
            setValue("");
            setCursorPos(0);
            setSuggestions([]);
            return;
          }
        }
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
        setValue("");
        setCursorPos(0);
        setSuggestions([]);
        return;
      }

      if (key.leftArrow && !key.ctrl && !key.meta) {
        setCursorPos((pos) => Math.max(0, pos - 1));
        return;
      }

      if (key.rightArrow && !key.ctrl && !key.meta) {
        setCursorPos((pos) => Math.min(value.length, pos + 1));
        return;
      }

      if (key.tab) {
        if (value.startsWith("/")) {
          const completed = completeInput(value, skillList);
          if (completed) {
            setValueAndCursor(completed, completed.length);
          } else if (pickerOpen) {
            fillSelected(safePickerIndex);
          }
        }
        return;
      }

      if (key.backspace) {
        deleteBeforeCursor();
        return;
      }

      if (key.delete) {
        deleteAtCursor();
        return;
      }

      if (input && !key.ctrl && !key.meta && isPrintableTextInput(input)) {
        insertAtCursor(input);
      }
    },
    { isActive: !disabled },
  );

  const visibleSuggestions = suggestions.slice(
    pickerScroll,
    pickerScroll + SUGGESTION_PICKER_VISIBLE,
  );
  const descMax = Math.max(16, contentWidth - 28);

  const placeholder = "Ask anything…";
  const showCursor = !disabled && cursorOn;

  return (
    <Box flexDirection="column" marginX={2}>
      {pickerOpen && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.border}
          paddingX={1}
          marginBottom={1}
        >
          <Box flexDirection="column" height={SUGGESTION_PICKER_VISIBLE} overflow="hidden">
            {visibleSuggestions.map((s, row) => {
              const index = pickerScroll + row;
              const selected = index === safePickerIndex;
              const desc = s.desc ? formatOneLineDescription(s.desc, descMax) : "";
              const label = s.label ?? s.cmd;
              const line = truncateLine(
                `${selected ? "› " : "  "}${label}${desc ? ` — ${desc}` : ""}`,
                contentWidth,
              );
              return (
                <Text key={`${s.cmd}-${index}`} color={selected ? theme.primary : theme.text}>
                  {line}
                </Text>
              );
            })}
          </Box>
          <Text color={theme.textMuted}>
            ↑↓ select · Enter run · Tab fill
            {suggestions.length > 1 ? ` · ${safePickerIndex + 1}/${suggestions.length}` : ""}
          </Text>
        </Box>
      )}

      <Panel theme={theme} borderColor={disabled ? theme.border : theme.primary} marginBottom={0}>
        <Box flexDirection="row">
          {value.length > 0 || cursorPos > 0 ? (
            <Text color={theme.text}>
              {value.slice(0, cursorPos)}
              <BlinkingCursor theme={theme} visible={showCursor} />
              {value.slice(cursorPos)}
            </Text>
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
            Tab completes /commands · /skill ↑↓ pick · Enter run skill · Shift+Enter newline · Ctrl+G latest
          </Text>
        )}
      </Box>
    </Box>
  );
}
