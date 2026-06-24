import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import type { CliRenderer } from "@opentui/core";
import { useTheme } from "../theme/provider.js";
import { truncate } from "../utils/text.js";
import { attachKeyHandler } from "../utils/keys.js";

export interface DialogSelectItem {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  marker?: string;
}

interface DialogSelectProps {
  title: string;
  items: DialogSelectItem[];
  filter?: string;
  hint?: string;
  onSelect: (item: DialogSelectItem) => void;
  onClose: () => void;
  renderer?: CliRenderer;
}

export function DialogSelect(props: DialogSelectProps) {
  const theme = useTheme();
  const [index, setIndex] = createSignal(0);
  const [filterText, setFilterText] = createSignal(props.filter ?? "");

  const filtered = () => {
    const q = filterText().toLowerCase();
    if (!q) return props.items;
    return props.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.subtitle?.toLowerCase().includes(q) ?? false),
    );
  };

  createEffect(() => {
    props.items;
    props.filter;
    setIndex(0);
    if (props.filter) setFilterText(props.filter);
  });

  onMount(() => {
    const renderer = props.renderer;
    if (!renderer) return;

    return attachKeyHandler(renderer, (key) => {
      const list = filtered();
      if (key.name === "escape") {
        props.onClose();
        key.preventDefault();
        return;
      }
      if (key.name === "up" || key.name === "pageup") {
        setIndex((i) => Math.max(0, i - (key.name === "pageup" ? 5 : 1)));
        key.preventDefault();
        return;
      }
      if (key.name === "down" || key.name === "pagedown") {
        setIndex((i) => Math.min(list.length - 1, i + (key.name === "pagedown" ? 5 : 1)));
        key.preventDefault();
        return;
      }
      if (key.name === "return" && list[index()]) {
        props.onSelect(list[index()]!);
        key.preventDefault();
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setFilterText((f) => f + key.sequence);
        setIndex(0);
        key.preventDefault();
      }
      if (key.name === "backspace") {
        setFilterText((f) => f.slice(0, -1));
        setIndex(0);
        key.preventDefault();
      }
    });
  });

  const safeIndex = () => Math.min(index(), Math.max(0, filtered().length - 1));
  const listHeight = 12;

  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <text fg={theme.text} attributes={1}>
          {props.title}
        </text>
        <text fg={theme.textMuted}>esc close</text>
      </box>
      <Show when={!props.filter}>
        <box flexDirection="row">
          <text fg={theme.textMuted}>filter: </text>
          <text fg={theme.text}>{filterText() || "…"}</text>
        </box>
      </Show>
      <Show when={props.filter}>
        <box flexDirection="row">
          <text fg={theme.textMuted}>filter: </text>
          <text fg={theme.text}>{props.filter}</text>
        </box>
      </Show>
      <box
        flexDirection="column"
        marginTop={1}
        borderStyle="rounded"
        borderColor={theme.border}
        paddingX={1}
        height={listHeight}
        overflow="hidden"
      >
        <For each={filtered().slice(0, listHeight)}>
          {(item, i) => (
            <text fg={i() === safeIndex() ? theme.primary : theme.text}>
              {`${i() === safeIndex() ? "› " : "  "}${item.marker ?? "●"} ${truncate(item.title, 72)}${item.subtitle ? ` ${truncate(item.subtitle, 40)}` : ""}`}
            </text>
          )}
        </For>
        <Show when={filtered().length === 0}>
          <text fg={theme.textMuted}>No matches.</text>
        </Show>
      </box>
      <text fg={theme.textMuted} marginTop={1}>
        ↑↓ navigate · Enter select
        {filtered().length > 0 ? ` · ${safeIndex() + 1}/${filtered().length}` : ""}
      </text>
      <Show when={props.hint}>
        <text fg={theme.textMuted}>{props.hint}</text>
      </Show>
    </box>
  );
}
