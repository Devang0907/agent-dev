import { For, createMemo, onCleanup, onMount } from "solid-js";
import type { CliRenderer, ScrollBoxRenderable } from "@opentui/core";
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
import { scrollToBottom } from "../../utils/scroll.js";
import { defaultScrollAcceleration } from "../../utils/scroll-acceleration.js";
import { setAuxiliaryKeyHandler } from "../../utils/keys.js";

interface SessionRouteProps {
  bridge: SessionBridge;
  renderer: CliRenderer;
  onSubmit: (value: string) => void;
}

export function SessionRoute(props: SessionRouteProps) {
  const theme = useTheme();
  let scrollRef: ScrollBoxRenderable | undefined;

  const s = () => props.bridge.state();
  const wide = () => props.renderer.width > WIDE_BREAKPOINT;
  const width = () => contentWidth(props.renderer.width, wide());
  const showScrollbar = () => props.renderer.width >= 80;

  const lastAssistantId = createMemo(() => {
    const msgs = s().displayMessages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.role === "assistant") return msgs[i]!.id;
    }
    return -1;
  });

  const goToBottom = () => {
    if (scrollRef) scrollToBottom(scrollRef);
  };

  onMount(() => {
    props.bridge.setScrollToLatest(goToBottom);

    setAuxiliaryKeyHandler((key) => {
      const scroll = scrollRef;
      if (!scroll || scroll.isDestroyed) return;
      if (s().dialog !== "none") return;

      if (key.name === "pageup") {
        scroll.scrollBy(-Math.max(1, Math.floor(scroll.viewport.height / 2)));
        key.preventDefault();
        return;
      }
      if (key.name === "pagedown") {
        scroll.scrollBy(Math.max(1, Math.floor(scroll.viewport.height / 2)));
        key.preventDefault();
        return;
      }
      if (key.name === "home" && !key.ctrl) {
        scroll.scrollTo(0);
        key.preventDefault();
        return;
      }
      if (key.name === "end" || (key.name === "g" && key.ctrl)) {
        goToBottom();
        key.preventDefault();
      }
    });

    onCleanup(() => {
      setAuxiliaryKeyHandler(null);
      props.bridge.setScrollToLatest(null);
    });
  });

  const renderMessage = (msg: DisplayMessage) => {
    const common = { width: width(), messageId: msg.id };
    if (msg.role === "user") {
      return <UserMessage content={msg.content} {...common} />;
    }
    if (msg.role === "assistant") {
      return (
        <AssistantMessage
          content={msg.content}
          {...common}
          model={s().model}
          showMeta={msg.id === lastAssistantId() && !s().running}
        />
      );
    }
    return <ToolMessage content={msg.content} toolName={msg.toolName} {...common} />;
  };

  const handleSubmit = (value: string) => {
    props.onSubmit(value);
    goToBottom();
  };

  return (
    <box flexDirection="row" width="100%" height="100%" minHeight={0} backgroundColor={theme.background}>
      <box flexDirection="column" flexGrow={1} height="100%" minHeight={0}>
        <scrollbox
          ref={(r) => {
            scrollRef = r;
          }}
          flexGrow={1}
          minHeight={0}
          stickyScroll
          stickyStart="bottom"
          viewportCulling
          scrollAcceleration={defaultScrollAcceleration()}
          viewportOptions={{ paddingRight: showScrollbar() ? 1 : 0 }}
          verticalScrollbarOptions={{
            paddingLeft: 1,
            visible: showScrollbar(),
            trackOptions: {
              backgroundColor: theme.backgroundElement,
              foregroundColor: theme.border,
            },
          }}
          paddingX={2}
          paddingY={1}
        >
          <box height={1} flexShrink={0} />
          <For each={s().displayMessages}>{(msg) => renderMessage(msg)}</For>
          {s().streamingText ? (
            <AssistantMessage
              content={s().streamingText}
              width={width()}
              streaming
            />
          ) : null}
          {s().toolProgress ? (
            <ToolMessage content={s().toolProgress} toolName="browser" width={width()} />
          ) : null}
        </scrollbox>

        {s().pendingCommand ? (
          <box flexShrink={0}>
            <PermissionPrompt
              request={s().pendingCommand!}
              onApprove={() => {
                props.bridge.session.respondToPermission(true);
                props.bridge.patch({ pendingCommand: null });
              }}
              onDeny={() => {
                props.bridge.session.respondToPermission(false);
                props.bridge.patch({ pendingCommand: null });
              }}
            />
          </box>
        ) : null}

        {s().pendingInteraction ? (
          <box flexShrink={0}>
            <BrowserPrompt
              request={s().pendingInteraction!}
              onContinue={(value) => {
                props.bridge.session.respondToInteraction(value);
                props.bridge.patch({ pendingInteraction: null });
              }}
            />
          </box>
        ) : null}

        {!s().pendingCommand && !s().pendingInteraction ? (
          <box flexShrink={0} paddingX={2} paddingY={1} alignItems="center">
            <Prompt
              model={s().model}
              agentMode={s().agentMode}
              orchestratorMode={s().orchestratorMode}
              skills={s().skillOptions}
              disabled={s().running}
              locked={s().dialog !== "none"}
              running={s().running}
              maxWidth={promptMaxWidth(props.renderer.width)}
              renderer={props.renderer}
              onSubmit={handleSubmit}
              onModeCycle={(dir) => props.bridge.session.cycleAgentMode(dir)}
              registerFocus={(fn) => props.bridge.registerPromptFocus(fn)}
            />
          </box>
        ) : null}
      </box>

      {wide() ? (
        <Sidebar
          workdir={props.bridge.workdir}
          sessionId={s().currentSessionId}
          settings={s().settings}
          planTasks={s().planTasks}
          skillsCount={s().skillOptions.length}
          contextUsage={s().contextUsage}
        />
      ) : null}
    </box>
  );
}
