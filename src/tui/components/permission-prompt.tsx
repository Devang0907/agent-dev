import { useTheme } from "../theme/provider.js";
import type { PermissionRequest } from "../../agent/loop.js";
import { LeftBorder } from "../ui/left-border.js";
import { useOverlayKeys } from "../utils/use-overlay-keys.js";

interface PermissionPromptProps {
  request: PermissionRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const theme = useTheme();

  useOverlayKeys((key) => {
    if (key.sequence === "y" || key.sequence === "Y") {
      props.onApprove();
      key.preventDefault();
    }
    if (key.sequence === "n" || key.sequence === "N" || key.name === "escape") {
      props.onDeny();
      key.preventDefault();
    }
  });

  return (
    <box flexDirection="column" marginBottom={1} paddingX={2}>
      <LeftBorder borderColor={theme.warning}>
        <text fg={theme.text} attributes={1}>
          Approve this action?
        </text>
        {props.request.workerId && props.request.runId ? (
          <text fg={theme.textMuted}>
            {" "}
            Worker {props.request.workerId} #{props.request.runId}
          </text>
        ) : null}
        <text fg={theme.textMuted}> y approve · n or Esc deny</text>
        <box
          marginTop={1}
          borderStyle="rounded"
          borderColor={theme.warning}
          paddingX={1}
          paddingY={0}
        >
          <text fg={theme.text}>{props.request.command}</text>
        </box>
        <text fg={theme.textMuted} marginTop={1}>
          The agent wants to run this command in your project directory.
        </text>
      </LeftBorder>
    </box>
  );
}
