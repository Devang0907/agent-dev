import { For } from "solid-js";
import { useTheme } from "../../theme/provider.js";
import { wrapText } from "../../utils/text.js";
import { LeftBorder } from "../../ui/left-border.js";

interface UserMessageProps {
  content: string;
  width: number;
}

export function UserMessage(props: UserMessageProps) {
  const theme = useTheme();
  const lines = () => wrapText(props.content, Math.max(10, props.width - 4));

  return (
    <box marginTop={1} marginBottom={1}>
      <LeftBorder borderColor={theme.primary}>
        <For each={lines()}>
          {(line) => (
            <text fg={theme.text} paddingLeft={1}>
              {line || " "}
            </text>
          )}
        </For>
      </LeftBorder>
    </box>
  );
}
