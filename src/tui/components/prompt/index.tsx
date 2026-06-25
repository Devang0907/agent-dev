import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { CliRenderer, SelectRenderable, TextareaRenderable } from "@opentui/core";
import type { Model } from "../../../providers/types.js";
import { modelRef } from "../../../config/models.js";
import type { AgentMode } from "../../../agent/mode.js";
import type { OrchestratorMode } from "../../../config/settings.js";
import { useTheme } from "../../theme/provider.js";
import { SPINNER_FRAMES } from "../../theme/tokens.js";
import {
  completeInput,
  formatOneLineDescription,
  getInputSuggestions,
  type InputSuggestion,
  type SkillNameOption,
} from "../../commands/slash-commands.js";
import { focusEditor, isPrintableKey, setPromptKeyHandler } from "../../utils/keys.js";
import type { KeyEvent } from "@opentui/core";

const PICKER_VISIBLE = 8;

function formatPickerOption(s: InputSuggestion): string {
  const cmd = s.label ?? s.cmd;
  if (!s.desc) return cmd;
  const desc = formatOneLineDescription(s.desc, 48);
  return `${cmd} "${desc}"`;
}

const PROMPT_KEY_BINDINGS = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "linefeed", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
] as const;

interface PromptProps {
  model: Model;
  agentMode: AgentMode;
  orchestratorMode: OrchestratorMode;
  skills: SkillNameOption[];
  disabled?: boolean;
  locked?: boolean;
  running?: boolean;
  maxWidth: number;
  renderer?: CliRenderer;
  onSubmit: (value: string) => void;
  onModeCycle?: (direction: 1 | -1) => void;
  onSuggestionsOpenChange?: (open: boolean) => void;
  registerFocus?: (fn: (() => void) | null) => void;
}

export function Prompt(props: PromptProps) {
  const theme = useTheme();
  let textareaRef: TextareaRenderable | undefined;
  let pickerSelectRef: SelectRenderable | undefined;
  const [value, setValue] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<InputSuggestion[]>([]);
  const [pickerIndex, setPickerIndex] = createSignal(0);
  const [spinIdx, setSpinIdx] = createSignal(0);

  const pickerOpen = () => suggestions().length > 0;
  const isSkillPicker = () => value() === "/skill" || value().startsWith("/skill ");

  const inputText = () => textareaRef?.plainText ?? value();

  const selectOptions = createMemo(() =>
    suggestions().map((s) => ({
      name: formatPickerOption(s),
      description: "",
      value: s,
    })),
  );

  const pickerHeight = () => Math.min(PICKER_VISIBLE, Math.max(1, suggestions().length));

  const resetPickerSelection = () => {
    setPickerIndex(0);
    pickerSelectRef?.setSelectedIndex(0);
  };

  const updateSuggestions = (text: string) => {
    setSuggestions(getInputSuggestions(text, props.skills));
    resetPickerSelection();
  };

  const syncText = (text: string) => {
    setValue(text);
    if (textareaRef && textareaRef.plainText !== text) {
      textareaRef.replaceText(text);
    }
    updateSuggestions(text);
  };

  const clearInput = () => {
    setValue("");
    setSuggestions([]);
    textareaRef?.setText("");
  };

  const focusTextarea = () => {
    const el = textareaRef;
    if (!el || el.isDestroyed || props.disabled || props.locked) return;
    focusEditor(props.renderer, el);
  };

  const safePickerIndex = () =>
    Math.min(pickerIndex(), Math.max(0, suggestions().length - 1));

  const selectedSuggestion = (): InputSuggestion | undefined => {
    const opt = pickerSelectRef?.getSelectedOption();
    if (opt?.value) return opt.value as InputSuggestion;
    return suggestions()[safePickerIndex()];
  };

  createEffect(() => {
    props.onSuggestionsOpenChange?.(pickerOpen());
  });

  createEffect(() => {
    if (props.disabled || props.locked) {
      const el = textareaRef;
      if (el && !el.isDestroyed) el.blur();
      return;
    }
    focusTextarea();
    const id = setTimeout(focusTextarea, 50);
    onCleanup(() => clearTimeout(id));
  });

  createEffect(() => {
    suggestions();
    resetPickerSelection();
  });

  onMount(() => {
    focusTextarea();
    const id = setTimeout(focusTextarea, 100);
    props.registerFocus?.(focusTextarea);
    onCleanup(() => {
      clearTimeout(id);
      props.registerFocus?.(null);
    });
  });

  onMount(() => {
    if (!props.running) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    onCleanup(() => clearInterval(id));
  });

  const applySuggestion = (suggestion: InputSuggestion) => {
    const text = isSkillPicker() ? `${suggestion.cmd} ` : suggestion.cmd;
    syncText(text);
    setSuggestions([]);
  };

  const handleSubmit = () => {
    if (props.disabled && !props.running) return;

    const pick = selectedSuggestion();
    if (pick) {
      if (isSkillPicker() && pick.cmd.startsWith("/skill ")) {
        applySuggestion(pick);
        return;
      }
      if (pick.cmd === "/skill") {
        syncText("/skill ");
        return;
      }
      if (!isSkillPicker()) {
        props.onSubmit(pick.cmd);
        clearInput();
        return;
      }
    }

    const trimmed = inputText().trim();
    if (trimmed) props.onSubmit(trimmed);
    clearInput();
  };

  onMount(() => {
    const handleKey = (key: KeyEvent) => {
      if (props.locked) return;
      if (props.disabled && !props.running) return;
      if (key.name === "escape" && props.running) {
        key.preventDefault();
        return;
      }

      const list = suggestions();
      const select = pickerSelectRef;
      if (list.length > 0 && (key.name === "up" || key.name === "down")) {
        if (select) {
          if (key.name === "up") select.moveUp(1);
          else select.moveDown(1);
          setPickerIndex(select.getSelectedIndex());
        } else {
          setPickerIndex((i) =>
            key.name === "up" ? Math.max(0, i - 1) : Math.min(list.length - 1, i + 1),
          );
        }
        key.preventDefault();
        return;
      }

      if (key.name === "tab") {
        const v = inputText();
        if (v.startsWith("/")) {
          const completed = completeInput(v, props.skills);
          if (completed) {
            syncText(completed);
          } else {
            const pick = selectedSuggestion();
            if (pick) applySuggestion(pick);
          }
        } else if (!pickerOpen() && props.onModeCycle) {
          props.onModeCycle(key.shift ? -1 : 1);
        }
        key.preventDefault();
        return;
      }

      if (key.name === "return" && !key.shift && list.length > 0) {
        handleSubmit();
        key.preventDefault();
        return;
      }

      const el = textareaRef;
      const renderer = props.renderer;
      if (!el || el.isDestroyed || !renderer) return;

      if (key.name === "backspace") {
        focusEditor(renderer, el);
        el.deleteCharBackward();
        key.preventDefault();
        return;
      }

      if (isPrintableKey(key)) {
        focusEditor(renderer, el);
        el.insertText(key.sequence);
        key.preventDefault();
      }
    };

    setPromptKeyHandler(handleKey);
    onCleanup(() => setPromptKeyHandler(null));
  });

  return (
    <box flexDirection="column" width={props.maxWidth}>
      {pickerOpen() ? (
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={theme.border}
          backgroundColor={theme.backgroundPanel}
          paddingX={1}
          marginBottom={1}
        >
          <select
            ref={(el) => {
              pickerSelectRef = el;
            }}
            options={selectOptions()}
            height={pickerHeight()}
            showScrollIndicator={suggestions().length > pickerHeight()}
            showDescription={false}
            itemSpacing={0}
            textColor={theme.text}
            selectedTextColor={theme.primary}
            selectedBackgroundColor="#1a3a5f"
            backgroundColor={theme.backgroundPanel}
            focusedTextColor={theme.text}
            onChange={(idx) => setPickerIndex(idx)}
          />
        </box>
      ) : null}

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={props.disabled || props.locked ? theme.border : theme.primary}
        backgroundColor={theme.backgroundPanel}
        paddingX={1}
        paddingY={1}
      >
        <textarea
          ref={(el) => {
            textareaRef = el;
          }}
          focused={!props.disabled && !props.locked}
          placeholder="Ask anything…"
          maxHeight={8}
          initialValue=""
          keyBindings={[...PROMPT_KEY_BINDINGS]}
          onContentChange={() => {
            const text = textareaRef?.plainText ?? "";
            setValue(text);
            updateSuggestions(text);
          }}
          onSubmit={() => handleSubmit()}
        />
        <box flexDirection="row">
          <text
            fg={
              props.orchestratorMode === "boss"
                ? theme.boss
                : props.agentMode === "plan"
                  ? theme.success
                  : theme.warning
            }
          >
            {props.orchestratorMode === "boss"
              ? "Boss"
              : props.agentMode === "plan"
                ? "Plan"
                : "Build"}
          </text>
          <text fg={theme.textMuted}> · </text>
          <text fg={theme.text}>{modelRef(props.model)}</text>
        </box>
      </box>

      <box marginTop={1}>
        {props.running ? (
          <box flexDirection="row">
            <text fg={theme.primary}>{SPINNER_FRAMES[spinIdx()]}</text>
            <text fg={theme.textMuted}> esc interrupt</text>
          </box>
        ) : (
          <text fg={theme.textMuted}>
            Tab switch mode · Shift+Tab reverse · Enter send · Shift+Enter newline · Ctrl+P palette
          </text>
        )}
      </box>
    </box>
  );
}
