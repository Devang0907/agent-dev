import { For, Show } from "solid-js";
import type { Model } from "../../../providers/types.js";
import { modelRef } from "../../../config/models.js";
import { useTheme } from "../../theme/provider.js";
import { wrapText } from "../../utils/text.js";

interface AssistantMessageProps {
  content: string;
  width: number;
  model?: Model;
  showMeta?: boolean;
  streaming?: boolean;
}

export function AssistantMessage(props: AssistantMessageProps) {
  const theme = useTheme();
  const lines = () => wrapText(props.content, Math.max(10, props.width - 6));

  return (
    <box marginTop={1} marginBottom={1} paddingLeft={3}>
      <For each={lines()}>
        {(line) => (
          <text fg={theme.text}>{line || " "}</text>
        )}
      </For>
      <Show when={props.streaming}>
        <text fg={theme.textMuted}> …</text>
      </Show>
      <Show when={props.showMeta && props.model}>
        <text fg={theme.textMuted}> ▣ {modelRef(props.model!)}</text>
      </Show>
    </box>
  );
}
