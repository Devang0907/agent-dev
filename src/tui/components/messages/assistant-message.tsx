import type { Model } from "../../../providers/types.js";
import { modelRef } from "../../../config/models.js";
import { useTheme } from "../../theme/provider.js";
import { getMarkdownSyntaxStyle } from "../../utils/syntax-style.js";

interface AssistantMessageProps {
  content: string;
  width: number;
  model?: Model;
  showMeta?: boolean;
  streaming?: boolean;
  messageId?: number;
}

export function AssistantMessage(props: AssistantMessageProps) {
  const theme = useTheme();
  const syntaxStyle = getMarkdownSyntaxStyle();

  return (
    <box
      id={props.messageId !== undefined ? `msg-${props.messageId}` : undefined}
      marginTop={1}
      marginBottom={1}
      paddingLeft={3}
      flexShrink={0}
      width={props.width}
    >
      <markdown
        content={props.content || " "}
        syntaxStyle={syntaxStyle}
        fg={theme.text}
        streaming={props.streaming ?? false}
        conceal
      />
      {props.showMeta && props.model ? (
        <text fg={theme.textMuted}> ▣ {modelRef(props.model)}</text>
      ) : null}
    </box>
  );
}
