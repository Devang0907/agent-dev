import { For } from "solid-js";
import { useTheme } from "../../theme/provider.js";
import { TOOL_ICONS } from "../../theme/tokens.js";
import { wrapText } from "../../utils/text.js";

interface ToolMessageProps {
  content: string;
  toolName?: string;
  width: number;
}

export function ToolMessage(props: ToolMessageProps) {
  const theme = useTheme();
  const icon = () => TOOL_ICONS[props.toolName ?? ""] ?? "·";
  const rawLines = () => props.content.split("\n");

  return (
    <box marginTop={0} marginBottom={1} paddingLeft={3}>
      <For each={rawLines()}>
        {(line, i) => {
          const prefix = i() === 0 ? `  ${icon()} ` : "     ";
          const wrapped = wrapText(line, Math.max(10, props.width - prefix.length - 6));
          return (
            <For each={wrapped}>
              {(wline, j) => (
                <text fg={theme.textMuted}>
                  {j() === 0 ? prefix : "     "}
                  {wline || " "}
                </text>
              )}
            </For>
          );
        }}
      </For>
    </box>
  );
}
