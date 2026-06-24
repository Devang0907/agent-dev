import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { CliRenderer, TextareaRenderable } from "@opentui/core";
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
import { attachKeyHandler } from "../../utils/keys.js";

const PICKER_VISIBLE = 8;

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
  running?: boolean;
  maxWidth: number;
  renderer?: CliRenderer;
  onSubmit: (value: string) => void;
  onModeCycle?: (direction: 1 | -1) => void;
  onSuggestionsOpenChange?: (open: boolean) => void;
}

export function Prompt(props: PromptProps) {
  const theme = useTheme();
  let textareaRef: TextareaRenderable | undefined;
  const [value, setValue] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<InputSuggestion[]>([]);
  const [pickerIndex, setPickerIndex] = createSignal(0);
  const [spinIdx, setSpinIdx] = createSignal(0);

  const pickerOpen = () => suggestions().length > 0;
  const isSkillPicker = () => value() === "/skill" || value().startsWith("/skill ");

  const inputText = () => textareaRef?.plainText ?? value();

  const updateSuggestions = (text: string) => {
    setSuggestions(getInputSuggestions(text, props.skills));
    setPickerIndex(0);
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
  createEffect(() => {
    props.onSuggestionsOpenChange?.(pickerOpen());
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

    const list = suggestions();
    if (list.length > 0) {
      const pick = list[pickerIndex()]!;
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
    const renderer = props.renderer;
    if (!renderer) return;

    return attachKeyHandler(renderer, (key) => {
      if (props.disabled && !props.running) return;
      if (key.name === "escape" && props.running) {
        key.preventDefault();
        return;
      }

      const list = suggestions();
      if (list.length > 0 && (key.name === "up" || key.name === "down")) {
        setPickerIndex((i) =>
          key.name === "up" ? Math.max(0, i - 1) : Math.min(list.length - 1, i + 1),
        );
        key.preventDefault();
        return;
      }

      if (key.name === "tab") {
        const v = inputText();
        if (v.startsWith("/")) {
          const completed = completeInput(v, props.skills);
          if (completed) {
            syncText(completed);
          } else if (list.length > 0) {
            applySuggestion(list[pickerIndex()]!);
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
      }
    });
  });

  const visible = () => suggestions().slice(0, PICKER_VISIBLE);

  return (
    <box flexDirection="column" width={props.maxWidth}>
      <Show when={pickerOpen()}>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={theme.border}
          backgroundColor={theme.backgroundPanel}
          paddingX={1}
          marginBottom={1}
        >
          <For each={visible()}>
            {(s, row) => {
              const desc = s.desc ? formatOneLineDescription(s.desc, 48) : "";
              const label = s.label ?? s.cmd;
              const line = `${row() === pickerIndex() ? "› " : "  "}${label}${desc ? ` — ${desc}` : ""}`;
              return (
                <text fg={row() === pickerIndex() ? theme.primary : theme.text}>{line}</text>
              );
            }}
          </For>
        </box>
      </Show>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={props.disabled ? theme.border : theme.primary}
        backgroundColor={theme.backgroundPanel}
        paddingX={1}
        paddingY={1}
      >
        <textarea
          ref={(el) => {
            textareaRef = el;
          }}
          focused={!props.disabled}
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
          <Show when={props.orchestratorMode === "boss"}>
            <text fg={theme.boss}>Boss</text>
          </Show>
          <Show when={props.orchestratorMode !== "boss"}>
            <text fg={props.agentMode === "plan" ? theme.success : theme.warning}>
              {props.agentMode === "plan" ? "Plan" : "Build"}
            </text>
          </Show>
          <text fg={theme.textMuted}> · </text>
          <text fg={theme.text}>{modelRef(props.model)}</text>
        </box>
      </box>

      <box marginTop={1}>
        <Show
          when={props.running}
          fallback={
            <text fg={theme.textMuted}>
              Tab switch mode · Shift+Tab reverse · Enter send · Shift+Enter newline · Ctrl+P palette
            </text>
          }
        >
          <box flexDirection="row">
            <text fg={theme.primary}>{SPINNER_FRAMES[spinIdx()]}</text>
            <text fg={theme.textMuted}> esc interrupt</text>
          </box>
        </Show>
      </box>
    </box>
  );
}
