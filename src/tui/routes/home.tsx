import { useTheme } from "../theme/provider.js";
import { Logo } from "../components/logo.js";
import { Prompt } from "../components/prompt/index.js";
import type { SessionBridge } from "../session-bridge.js";
import type { CliRenderer } from "@opentui/core";
import { modelRef } from "../../config/models.js";
import { shortPath, promptMaxWidth } from "../utils/text.js";
import { formatTokenCount } from "../../agent/compaction/tokens.js";
import { UPDATE_COMMAND } from "../../version/check.js";
import { Show } from "solid-js";
interface HomeRouteProps {
  bridge: SessionBridge;
  renderer: CliRenderer;
  onSubmit: (value: string) => void;
  onQuit: () => void;
}

export function HomeRoute(props: HomeRouteProps) {
  const theme = useTheme();
  const s = () => props.bridge.state();
  const maxW = () => promptMaxWidth(props.renderer.width);

  return (
    <box flexDirection="column" width="100%" height="100%" minHeight={0} backgroundColor={theme.background}>
      <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
        <Logo
          tagline={
            s().projectRulesCount > 0
              ? `Autonomous coding agent · AGENTS.md (${s().projectRulesCount} file${s().projectRulesCount === 1 ? "" : "s"})`
              : undefined
          }
        />
        <box marginTop={2} width={maxW()}>
          <Show when={s().dialog === "none"}>
            <Prompt
              model={s().model}
              agentMode={s().agentMode}
              orchestratorMode={s().orchestratorMode}
              skills={s().skillOptions}
              maxWidth={maxW()}
              renderer={props.renderer}
              onSubmit={props.onSubmit}
              onModeCycle={(dir: 1 | -1) => props.bridge.session.cycleAgentMode(dir)}
              registerFocus={(fn) => props.bridge.registerPromptFocus(fn)}
            />
          </Show>
        </box>
      </box>
      <box
        paddingX={2}
        paddingY={1}
        borderStyle="single"
        border={["top"]}
        borderColor={theme.border}
        flexDirection="row"
        flexWrap="wrap"
      >
        <text fg={theme.primary}>⌂ </text>
        <text fg={theme.textMuted}>{shortPath(props.bridge.workdir)}</text>
        <text fg={theme.textMuted}> · </text>
        <text fg={theme.text}>{modelRef(s().model)}</text>
        <Show when={s().contextUsage.tokens > 0}>
          <text fg={theme.textMuted}>
            {" · ctx "}
            {formatTokenCount(s().contextUsage.tokens)}/{formatTokenCount(s().contextUsage.window)}
          </text>
        </Show>
        <Show when={s().updateInfo}>
          <text fg={theme.warning}> · ↑ v{s().updateInfo!.latest}</text>
          <text fg={theme.textMuted}> · {UPDATE_COMMAND}</text>
        </Show>
      </box>
    </box>
  );
}
