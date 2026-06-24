import { For, Show, createMemo } from "solid-js";
import type { CliRenderer } from "@opentui/core";
import { useTheme } from "../../theme/provider.js";
import { UserMessage } from "../../components/messages/user-message.js";
import { AssistantMessage } from "../../components/messages/assistant-message.js";
import { ToolMessage } from "../../components/messages/tool-message.js";
import { Prompt } from "../../components/prompt/index.js";
import { PermissionPrompt } from "../../components/permission-prompt.js";
import { BrowserPrompt } from "../../components/browser-prompt.js";
import { Sidebar } from "./sidebar.js";
import type { SessionBridge } from "../../session-bridge.js";
import type { DisplayMessage } from "../../display.js";
import { contentWidth, promptMaxWidth, WIDE_BREAKPOINT } from "../../utils/text.js";

interface SessionRouteProps {
  bridge: SessionBridge;
  renderer: CliRenderer;
  onSubmit: (value: string) => void;
}

export function SessionRoute(props: SessionRouteProps) {
  const theme = useTheme();
  const s = () => props.bridge.state();
  const wide = () => props.renderer.width > WIDE_BREAKPOINT;
  const width = () => contentWidth(props.renderer.width, wide());

  const lastAssistantId = createMemo(() => {
    const msgs = s().displayMessages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.role === "assistant") return msgs[i]!.id;
    }
    return -1;
  });

  const renderMessage = (msg: DisplayMessage) => {
    if (msg.role === "user") {
      return <UserMessage content={msg.content} width={width()} />;
    }
    if (msg.role === "assistant") {
      return (
        <AssistantMessage
          content={msg.content}
          width={width()}
          model={s().model}
          showMeta={msg.id === lastAssistantId() && !s().running}
        />
      );
    }
    return <ToolMessage content={msg.content} toolName={msg.toolName} width={width()} />;
  };

  return (
    <box flexDirection="row" width="100%" height="100%" backgroundColor={theme.background}>
      <box flexDirection="column" flexGrow={1} height="100%">
        <scrollbox
          flexGrow={1}
          stickyScroll
          stickyStart="bottom"
          paddingX={2}
          paddingY={1}
        >
          <For each={s().displayMessages}>{(msg) => renderMessage(msg)}</For>
          <Show when={s().streamingText}>
            <AssistantMessage
              content={s().streamingText}
              width={width()}
              streaming
            />
          </Show>
          <Show when={s().toolProgress}>
            <ToolMessage
              content={s().toolProgress}
              toolName="browser"
              width={width()}
            />
          </Show>
        </scrollbox>

        <Show when={s().pendingCommand}>
          {(req) => (
            <PermissionPrompt
              request={req()}
              renderer={props.renderer}
              onApprove={() => {
                props.bridge.session.respondToPermission(true);
                props.bridge.patch({ pendingCommand: null });
              }}
              onDeny={() => {
                props.bridge.session.respondToPermission(false);
                props.bridge.patch({ pendingCommand: null });
              }}
            />
          )}
        </Show>

        <Show when={s().pendingInteraction}>
          {(req) => (
            <BrowserPrompt
              request={req()}
              renderer={props.renderer}
              onContinue={(value) => {
                props.bridge.session.respondToInteraction(value);
                props.bridge.patch({ pendingInteraction: null });
              }}
            />
          )}
        </Show>

        <Show when={!s().pendingCommand && !s().pendingInteraction && s().dialog === "none"}>
          <box paddingX={2} paddingY={1} alignItems="center">
            <Prompt
              model={s().model}
              agentMode={s().agentMode}
              orchestratorMode={s().orchestratorMode}
              skills={s().skillOptions}
              disabled={s().running}
              running={s().running}
              maxWidth={promptMaxWidth(props.renderer.width)}
              renderer={props.renderer}
              onSubmit={props.onSubmit}
              onModeCycle={(dir) => props.bridge.session.cycleAgentMode(dir)}
            />
          </box>
        </Show>
      </box>

      <Show when={wide()}>
        <Sidebar
          workdir={props.bridge.workdir}
          sessionId={s().currentSessionId}
          settings={s().settings}
          planTasks={s().planTasks}
          skillsCount={s().skillOptions.length}
          contextUsage={s().contextUsage}
        />
      </Show>
    </box>
  );
}
