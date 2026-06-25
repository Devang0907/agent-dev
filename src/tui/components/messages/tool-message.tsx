import { For } from "solid-js";
import { useTheme } from "../../theme/provider.js";
import { TOOL_ICONS } from "../../theme/tokens.js";
import { collapseToolOutput } from "../../utils/collapse-tool-output.js";
import { wrapText } from "../../utils/text.js";

const TOOL_MAX_LINES = 24;
const TOOL_MAX_CHARS = 2400;

interface ToolMessageProps {
  content: string;
  toolName?: string;
  width: number;
  messageId?: number;
}

export function ToolMessage(props: ToolMessageProps) {
  const theme = useTheme();
  const icon = () => TOOL_ICONS[props.toolName ?? ""] ?? "·";
  const collapsed = () => collapseToolOutput(props.content, TOOL_MAX_LINES, TOOL_MAX_CHARS);
  const rawLines = () => collapsed().output.split("\n");

  return (
    <box
      id={props.messageId !== undefined ? `msg-${props.messageId}` : undefined}
      marginTop={0}
      marginBottom={1}
      paddingLeft={3}
      flexShrink={0}
      width={props.width}
    >
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
      {collapsed().overflow ? (
        <text fg={theme.textMuted}>     … output truncated</text>
      ) : null}
    </box>
  );
}
