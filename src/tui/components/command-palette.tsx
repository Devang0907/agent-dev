import { For, Show, createSignal, onMount } from "solid-js";
import type { CliRenderer } from "@opentui/core";
import { useTheme } from "../theme/provider.js";
import type { CommandEntry } from "../commands/registry.js";
import { fuzzyFilter } from "../commands/registry.js";
import { truncate } from "../utils/text.js";
import { attachKeyHandler } from "../utils/keys.js";

interface CommandPaletteProps {
  open: boolean;
  commands: CommandEntry[];
  renderer?: CliRenderer;
  onRun: (entry: CommandEntry) => void;
  onClose: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const theme = useTheme();
  const [filter, setFilter] = createSignal("");
  const [index, setIndex] = createSignal(0);

  const filtered = () => fuzzyFilter(props.commands, filter());
  const safeIndex = () => Math.min(index(), Math.max(0, filtered().length - 1));

  onMount(() => {
    const renderer = props.renderer;
    if (!renderer) return;

    return attachKeyHandler(renderer, (key) => {
      if (!props.open) return;
      if (key.name === "escape") {
        props.onClose();
        key.preventDefault();
        return;
      }
      const list = filtered();
      if (key.name === "up") {
        setIndex((i) => Math.max(0, i - 1));
        key.preventDefault();
        return;
      }
      if (key.name === "down") {
        setIndex((i) => Math.min(list.length - 1, i + 1));
        key.preventDefault();
        return;
      }
      if (key.name === "return" && list[safeIndex()]) {
        props.onRun(list[safeIndex()]!);
        key.preventDefault();
        return;
      }
      if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
        setFilter((f) => f + key.sequence);
        setIndex(0);
        key.preventDefault();
      }
      if (key.name === "backspace") {
        setFilter((f) => f.slice(0, -1));
        setIndex(0);
        key.preventDefault();
      }
    });
  });

  return (
    <Show when={props.open}>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="rgba(0,0,0,0.65)"
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
          <box flexDirection="column" marginTop={1} flexGrow={1}>
            <For each={filtered().slice(0, 12)}>
              {(entry, i) => (
                <text fg={i() === safeIndex() ? theme.primary : theme.text}>
                  {`${i() === safeIndex() ? "› " : "  "}● ${entry.slash ?? entry.id} — ${truncate(entry.title, 50)}`}
                </text>
              )}
            </For>
          </box>
        </box>
      </box>
    </Show>
  );
}
