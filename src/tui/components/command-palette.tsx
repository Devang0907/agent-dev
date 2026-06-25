import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { SelectRenderable } from "@opentui/core";
import { useTheme } from "../theme/provider.js";
import type { CommandEntry } from "../commands/registry.js";
import { fuzzyFilter } from "../commands/registry.js";
import { truncate } from "../utils/text.js";
import { DIALOG_LIST_VISIBLE_ROWS } from "../utils/scroll.js";
import { setOverlayKeyHandler } from "../utils/keys.js";

interface CommandPaletteProps {
  open: boolean;
  commands: CommandEntry[];
  onRun: (entry: CommandEntry) => void;
  onClose: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const theme = useTheme();
  let selectRef: SelectRenderable | undefined;
  const [filter, setFilter] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const filtered = () => fuzzyFilter(props.commands, filter());
  const selectOptions = createMemo(() =>
    filtered().map((entry) => ({
      name: `● ${entry.slash ?? entry.id} — ${truncate(entry.title, 50)}`,
      description: "",
      value: entry,
    })),
  );

  const resetSelection = () => {
    setSelectedIndex(0);
    selectRef?.setSelectedIndex(0);
  };

  createEffect(() => {
    filter();
    resetSelection();
  });

  createEffect(() => {
    if (!props.open) return;

    setOverlayKeyHandler((key) => {
      const select = selectRef;
      if (key.name === "escape") {
        props.onClose();
        key.preventDefault();
        return;
      }
      if (key.name === "up") {
        select?.moveUp(1);
        setSelectedIndex(select?.getSelectedIndex() ?? 0);
        key.preventDefault();
        return;
      }
      if (key.name === "down") {
        select?.moveDown(1);
        setSelectedIndex(select?.getSelectedIndex() ?? 0);
        key.preventDefault();
        return;
      }
      if (key.name === "return" || key.name === "kpenter") {
        const opt = select?.getSelectedOption();
        if (opt?.value) props.onRun(opt.value as CommandEntry);
        key.preventDefault();
        return;
      }
      if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
        setFilter((f) => f + key.sequence);
        key.preventDefault();
        return;
      }
      if (key.name === "backspace") {
        setFilter((f) => f.slice(0, -1));
        key.preventDefault();
      }
    });

    onCleanup(() => setOverlayKeyHandler(null));
  });

  const visibleRows = DIALOG_LIST_VISIBLE_ROWS;
  const safeIndex = () => Math.min(selectedIndex(), Math.max(0, filtered().length - 1));

  return (
    <Show when={props.open}>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor={theme.dialogScrim}
        zIndex={4000}
        justifyContent="center"
        alignItems="center"
      >
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={theme.borderActive}
          backgroundColor={theme.backgroundPanel}
          paddingX={2}
          paddingY={1}
          width={88}
          height={20}
        >
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.text} attributes={1}>
              Command palette
            </text>
            <text fg={theme.textMuted}>esc close</text>
          </box>
          <box flexDirection="row" marginTop={1}>
            <text fg={theme.textMuted}>filter: </text>
            <text fg={theme.text}>{filter() || "…"}</text>
          </box>
          <box marginTop={1}>
            <select
              ref={(el) => {
                selectRef = el;
              }}
              focused
              options={selectOptions()}
              height={visibleRows}
              showScrollIndicator={true}
              showDescription={false}
              textColor={theme.text}
              selectedTextColor={theme.primary}
              backgroundColor={theme.backgroundPanel}
              focusedTextColor={theme.text}
              onChange={(idx) => setSelectedIndex(idx)}
              onSelect={(_, opt) => {
                if (opt?.value) props.onRun(opt.value as CommandEntry);
              }}
            />
          </box>
        </box>
      </box>
    </Show>
  );
}
