import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Box, Text } from "ink";
import type { Key } from "ink";
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

function wantsNewlineOnEnter(input: string, key: Key): boolean {
  return key.shift || key.meta || input === "\n" || input === "\r\n";
}

import type { AgentMode } from "../agent/mode.js";
import type { OrchestratorMode } from "../config/settings.js";
import type { VoiceState } from "../voice/types.js";

interface EditorProps {
  theme: ThemeColors;
  model: Model;
  agentMode?: AgentMode;
  orchestratorMode?: OrchestratorMode;
  skills?: SkillNameOption[];
  contentWidth?: number;
  disabled?: boolean;
  running?: boolean;
  voiceState?: VoiceState;
  voiceTranscript?: string;
  voiceTranscriptSeq?: number;
  onSuggestionsOpenChange?: (open: boolean) => void;
  onModeCycle?: (direction: 1 | -1) => void;
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

export function mergeVoiceTranscript(existing: string, cursorPos: number, transcript: string): {
  text: string;
  cursorPos: number;
} {
  if (!existing) {
    return { text: transcript, cursorPos: transcript.length };
  }
  const pos = Math.min(cursorPos, existing.length);
  const before = existing.slice(0, pos);
  const after = existing.slice(pos);
  const sepBefore = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const sepAfter = after.length > 0 && !/^\s/.test(after) ? " " : "";
  const inserted = sepBefore + transcript + sepAfter;
  const text = before + inserted + after;
  return { text, cursorPos: pos + sepBefore.length + transcript.length };
}

export function Editor({
  theme,
  model,
  agentMode = "build",
  orchestratorMode = "off",
  skills = [],
  contentWidth = 72,
  disabled,
  running,
  voiceState = "idle",
  voiceTranscript,
  voiceTranscriptSeq = 0,
  onSuggestionsOpenChange,
  onModeCycle,
  onSubmit,
}: EditorProps) {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [suggestions, setSuggestions] = useState<InputSuggestion[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerScroll, setPickerScroll] = useState(0);
  const [spinIdx, setSpinIdx] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const valueRef = useRef(value);
  const cursorPosRef = useRef(cursorPos);
  const lastAppliedVoiceSeq = useRef(0);

  const skillList = useMemo(() => skills, [skills]);
  const voiceBusy = voiceState === "listening" || voiceState === "transcribing";
  const isSkillPicker = value === "/skill" || value.startsWith("/skill ");
  const pickerOpen = suggestions.length > 0;

  useEffect(() => {
    onSuggestionsOpenChange?.(pickerOpen);
    return () => onSuggestionsOpenChange?.(false);
  }, [pickerOpen, onSuggestionsOpenChange]);

  useEffect(() => {
    if (!running && !voiceBusy) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [running, voiceBusy]);

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

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    cursorPosRef.current = cursorPos;
  }, [cursorPos]);

  useEffect(() => {
    if (!voiceTranscriptSeq || voiceTranscript === undefined) return;
    if (voiceTranscriptSeq <= lastAppliedVoiceSeq.current) return;
    lastAppliedVoiceSeq.current = voiceTranscriptSeq;

    const merged = mergeVoiceTranscript(valueRef.current, cursorPosRef.current, voiceTranscript);
    setValue(merged.text);
    setCursorPos(merged.cursorPos);
    cursorPosRef.current = merged.cursorPos;
    setSuggestions(getInputSuggestions(merged.text, skillList));
  }, [voiceTranscript, voiceTranscriptSeq, skillList]);

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
      if (disabled || voiceBusy) return;

      if (pickerOpen && (key.upArrow || key.downArrow)) {
        movePicker(key.upArrow ? -1 : 1);
        return;
      }

      if (input === "\n" || input === "\r\n" || (key.ctrl && input === "j")) {
        insertAtCursor("\n");
        return;
      }

      if (key.return) {
        if (wantsNewlineOnEnter(input, key)) {
          insertAtCursor("\n");
          return;
        }
        if (pickerOpen) {
          const pick = suggestions[safePickerIndex];
          if (pick) {
            if (isSkillPicker) {
              const next = applySuggestion(pick, true);
              setValueAndCursor(next, next.length);
              return;
            }
            if (pick.cmd === "/skill") {
              setValueAndCursor("/skill ", "/skill ".length);
              return;
            }
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
        } else if (!pickerOpen && onModeCycle) {
          onModeCycle(key.shift ? -1 : 1);
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
    { isActive: !disabled && !voiceBusy },
  );

  const visibleSuggestions = suggestions.slice(
    pickerScroll,
    pickerScroll + SUGGESTION_PICKER_VISIBLE,
  );
  const descMax = Math.max(16, contentWidth - 28);

  const placeholder = voiceBusy
    ? voiceState === "transcribing"
      ? "Transcribing…"
      : "Listening… speak your task"
    : "Ask anything…";
  const voiceStatus =
    voiceState === "transcribing" ? "Transcribing speech…" : "Listening… speak now";
  const showCursor = !disabled && !voiceBusy && cursorOn;

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
            {isSkillPicker
              ? "↑↓ select · Enter fill · Tab fill · add prompt then Enter send"
              : "↑↓ select · Enter open · Tab fill"}
            {suggestions.length > 1 ? ` · ${safePickerIndex + 1}/${suggestions.length}` : ""}
          </Text>
        </Box>
      )}

      {voiceBusy && (
        <Box
          flexDirection="row"
          borderStyle="round"
          borderColor={theme.primary}
          paddingX={1}
          marginBottom={1}
        >
          <Text color={theme.primary}>
            {SPINNER_FRAMES[spinIdx]} {voiceStatus}
          </Text>
          <Text color={theme.textMuted}> · Esc cancel</Text>
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
              <Text color={voiceBusy ? theme.primary : theme.textMuted}>{placeholder}</Text>
            </>
          )}
        </Box>
        <Text color={theme.textMuted}>
          {orchestratorMode === "boss" ? (
            <Text color={theme.boss}>Boss</Text>
          ) : orchestratorMode === "multi" ? (
            <Text color={theme.multi}>Multi</Text>
          ) : (
            <Text color={agentMode === "plan" ? theme.success : theme.warning}>
              {agentMode === "plan" ? "Plan" : "Build"}
            </Text>
          )}
          {" · "}
          <Text color={theme.text}>{modelRef(model)}</Text>
        </Text>
      </Panel>

      <Box marginTop={1} marginBottom={1}>
        {running ? (
          <Text color={theme.textMuted}>
            <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]}</Text>
            {" "}esc interrupt
          </Text>
        ) : voiceBusy ? (
          <Text color={theme.textMuted}>
            <Text color={theme.primary}>{SPINNER_FRAMES[spinIdx]}</Text>
            {" "}
            {voiceState === "transcribing" ? "transcribing voice input" : "voice input active · Esc cancel"}
          </Text>
        ) : (
          <Text color={theme.textMuted}>
            Tab switch mode · Shift+Tab reverse · Enter send · Ctrl+B voice · Ctrl+G latest
          </Text>
        )}
      </Box>
    </Box>
  );
}
