import { onMount } from "solid-js";
import type { CliRenderer } from "@opentui/core";
import { useTheme } from "../theme/provider.js";
import type { InteractionRequest } from "../../agent/loop.js";
import { LeftBorder } from "../ui/left-border.js";
import { attachKeyHandler } from "../utils/keys.js";

interface BrowserPromptProps {
  request: InteractionRequest;
  renderer: CliRenderer;
  onContinue: (value: string) => void;
}

export function BrowserPrompt(props: BrowserPromptProps) {
  const theme = useTheme();

  onMount(() =>
    attachKeyHandler(props.renderer, (key) => {
      if (key.name === "return") {
        props.onContinue("continue");
        key.preventDefault();
      }
    }),
  );

  return (
    <box flexDirection="column" marginBottom={1} paddingX={2}>
      <LeftBorder borderColor={theme.primary}>
        <text fg={theme.text} attributes={1}>
          Browser interaction required
        </text>
        <text fg={theme.textMuted}> {props.request.reason}</text>
        <text fg={theme.textMuted} marginTop={1}>
          Complete the steps in the browser, then press Enter to continue.
        </text>
      </LeftBorder>
    </box>
  );
}
