import { createEffect, createMemo, createSignal } from "solid-js";
import type { SelectRenderable } from "@opentui/core";
import { useTheme } from "../theme/provider.js";
import { DIALOG_LIST_VISIBLE_ROWS } from "../utils/scroll.js";
import { useOverlayKeys } from "../utils/use-overlay-keys.js";

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
}

export function DialogSelect(props: DialogSelectProps) {
  const theme = useTheme();
  let selectRef: SelectRenderable | undefined;
  const [filterText, setFilterText] = createSignal(props.filter ?? "");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

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

  const selectOptions = createMemo(() =>
    filtered().map((item) => ({
      name: `${item.marker ?? "●"} ${item.title}`,
      description: item.subtitle ?? "",
      value: item,
    })),
  );

  const resetSelection = () => {
    setSelectedIndex(0);
    selectRef?.setSelectedIndex(0);
  };

  createEffect(() => {
    props.items;
    props.filter;
    if (props.filter) setFilterText(props.filter);
    resetSelection();
  });

  createEffect(() => {
    filterText();
    resetSelection();
  });

  useOverlayKeys((key) => {
    const select = selectRef;
    if (key.name === "escape") {
      props.onClose();
      key.preventDefault();
      return;
    }
    if (key.name === "up" || key.name === "pageup") {
      select?.moveUp(key.name === "pageup" ? 5 : 1);
      setSelectedIndex(select?.getSelectedIndex() ?? 0);
      key.preventDefault();
      return;
    }
    if (key.name === "down" || key.name === "pagedown") {
      select?.moveDown(key.name === "pagedown" ? 5 : 1);
      setSelectedIndex(select?.getSelectedIndex() ?? 0);
      key.preventDefault();
      return;
    }
    if ((key.name === "return" || key.name === "kpenter") && !key.shift) {
      const opt = select?.getSelectedOption();
      if (opt?.value) props.onSelect(opt.value as DialogSelectItem);
      key.preventDefault();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setFilterText((f) => f + key.sequence);
      key.preventDefault();
      return;
    }
    if (key.name === "backspace") {
      setFilterText((f) => f.slice(0, -1));
      key.preventDefault();
    }
  });

  const visibleRows = DIALOG_LIST_VISIBLE_ROWS;
  const safeIndex = () => Math.min(selectedIndex(), Math.max(0, filtered().length - 1));

  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <text fg={theme.text} attributes={1}>
          {props.title}
        </text>
        <text fg={theme.textMuted}>esc close</text>
      </box>
      {!props.filter ? (
        <box flexDirection="row">
          <text fg={theme.textMuted}>filter: </text>
          <text fg={theme.text}>{filterText() || "…"}</text>
        </box>
      ) : (
        <box flexDirection="row">
          <text fg={theme.textMuted}>filter: </text>
          <text fg={theme.text}>{props.filter}</text>
        </box>
      )}
      <box marginTop={1}>
        {selectOptions().length > 0 ? (
          <select
            ref={(el) => {
              selectRef = el;
            }}
            focused
            options={selectOptions()}
            height={visibleRows}
            showScrollIndicator={true}
            showDescription={true}
            textColor={theme.text}
            descriptionColor={theme.textMuted}
            selectedTextColor={theme.primary}
            selectedDescriptionColor={theme.textMuted}
            backgroundColor={theme.backgroundPanel}
            focusedTextColor={theme.text}
            onChange={(idx) => setSelectedIndex(idx)}
            onSelect={(_, opt) => {
              if (opt?.value) props.onSelect(opt.value as DialogSelectItem);
            }}
          />
        ) : (
          <text fg={theme.textMuted}>No matches.</text>
        )}
      </box>
      <text fg={theme.textMuted} marginTop={1}>
        ↑↓ navigate · Enter select
        {filtered().length > 0 ? ` · ${safeIndex() + 1}/${filtered().length}` : " "}
      </text>
      {props.hint ? <text fg={theme.textMuted}>{props.hint}</text> : null}
    </box>
  );
}
