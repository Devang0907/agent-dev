import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, useApp } from "ink";
import type { AgentSession, SessionEvent } from "../agent/session.js";
import { ChatView } from "./ChatView.js";
import { Editor } from "./Editor.js";
import { Footer } from "./Footer.js";
import { ModelSelector } from "./ModelSelector.js";
import { ApiKeyPrompt } from "./ApiKeyPrompt.js";
import { SettingsView } from "./SettingsView.js";
import { SessionSelector } from "./SessionSelector.js";
import { hasProviderAuth, getDefaultModelForProvider } from "../providers/registry.js";
import type { Model, ProviderId } from "../providers/types.js";
import type { ChatMessage } from "../providers/types.js";
import { findModel } from "../config/models.js";
import type { Settings } from "../config/settings.js";
import { CommandApprovalPrompt } from "./CommandApprovalPrompt.js";
import type { PermissionRequest } from "../agent/loop.js";
import { StartupBanner } from "./StartupBanner.js";
import { getTheme } from "./theme.js";
import { formatToolForDisplay } from "./format-tool.js";
import type { SessionSummary } from "../session/manager.js";
import { buildChatLines } from "./chat-lines.js";
import { chatContentWidth, useTerminalSize } from "./layout.js";
import {
  chatViewportHeight,
  effectiveScrollTop,
  isFollowing,
  maxSlashSuggestions,
  MIN_CHAT_ROWS,
  safeTerminalRows,
  slashSuggestionRows,
} from "./scroll.js";
import { useMouseScroll } from "./useMouseScroll.js";
import { WHEEL_SCROLL_LINES } from "./mouse.js";
import { useAppInput } from "./useAppInput.js";

let nextMessageId = 0;

function toDisplayMessage(
  role: DisplayMessage["role"],
  content: string,
  toolName?: string,
): DisplayMessage {
  return { id: nextMessageId++, role, content, toolName };
}

function chatMessagesToDisplay(messages: ChatMessage[]): DisplayMessage[] {
  nextMessageId = 0;
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
    .map((m) =>
      toDisplayMessage(
        m.role as DisplayMessage["role"],
        m.role === "tool" ? formatToolForDisplay(m.name ?? "tool", m.content) : m.content,
        m.name,
      ),
    );
}

export interface DisplayMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

type Overlay = "none" | "model" | "settings" | "apiKey" | "commandApproval" | "sessions";

interface AppProps {
  session: AgentSession;
  workdir: string;
  onQuit: () => void;
}

function modelForProvider(provider: ProviderId, settings: Settings): Model {
  const current = findModel(settings.defaultProvider, settings.defaultModel);
  if (current?.provider === provider) return current;
  return getDefaultModelForProvider(provider)!;
}

export function App({ session, workdir, onQuit }: AppProps) {
  const { exit } = useApp();
  const terminal = useTerminalSize();
  const terminalRows = safeTerminalRows(terminal.rows);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const contentWidth = chatContentWidth(terminal.cols);

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    chatMessagesToDisplay(session.getMessages()),
  );
  const [streamingText, setStreamingText] = useState("");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [modelFilter, setModelFilter] = useState<string | undefined>();
  const [pendingModel, setPendingModel] = useState<Model | null>(null);
  const [apiKeyReturnOverlay, setApiKeyReturnOverlay] = useState<Overlay>("none");
  const [settings, setSettings] = useState(session.getSettings());
  const [model, setModel] = useState(session.getModel());
  const [running, setRunning] = useState(false);
  /** null = follow latest output */
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PermissionRequest | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState(session.getSessionId());
  const [sessionListRefresh, setSessionListRefresh] = useState(0);
  const streamingRef = useRef("");
  const startupChecked = useRef(false);

  const theme = getTheme();

  const hasChat = displayMessages.length > 0 || streamingText.length > 0;
  const minMainRows = hasChat ? MIN_CHAT_ROWS : suggestionCount > 0 ? 1 : 0;
  const viewportHeight = chatViewportHeight(
    terminal.rows,
    slashSuggestionRows(suggestionCount),
    minMainRows,
  );
  const maxSuggestions = maxSlashSuggestions(terminal.rows, minMainRows);

  const chatLines = useMemo(
    () =>
      buildChatLines(displayMessages, {
        width: contentWidth,
        model,
        streamingText,
        running,
      }),
    [displayMessages, contentWidth, model, streamingText, running],
  );

  const maxScroll = Math.max(0, chatLines.length - viewportHeight);
  const scrollTop = effectiveScrollTop(scrollOffset, maxScroll);
  const following = isFollowing(scrollOffset, maxScroll);

  const scrollBy = useCallback(
    (delta: number) => {
      setScrollOffset((prev) => {
        const current = effectiveScrollTop(prev, maxScroll);
        const next = Math.max(0, Math.min(maxScroll, current + delta));
        return next >= maxScroll ? null : next;
      });
    },
    [maxScroll],
  );

  const scrollPageUp = useCallback(() => {
    scrollBy(-viewportHeight);
  }, [scrollBy, viewportHeight]);

  const scrollPageDown = useCallback(() => {
    scrollBy(viewportHeight);
  }, [scrollBy, viewportHeight]);

  const followLatest = useCallback(() => {
    setScrollOffset(null);
  }, []);

  const openApiKeyPrompt = useCallback(
    (target: Model, returnTo: Overlay = "none") => {
      setPendingModel(target);
      setApiKeyReturnOverlay(returnTo);
      setOverlay("apiKey");
    },
    [],
  );

  const saveApiKey = useCallback(
    (apiKey: string) => {
      if (!pendingModel) return;
      const updated = {
        ...settings,
        apiKeys: { ...settings.apiKeys, [pendingModel.provider]: apiKey },
      };
      session.updateSettings(updated);
      setSettings(updated);
      session.setModel(pendingModel);
      setModel(pendingModel);
      setPendingModel(null);
      setOverlay(apiKeyReturnOverlay);
      setApiKeyReturnOverlay("none");
      setModelFilter(undefined);
    },
    [pendingModel, settings, session, apiKeyReturnOverlay],
  );

  const loadSession = useCallback(
    (summary: SessionSummary) => {
      session.loadSession(summary.sessionId);
      setDisplayMessages(chatMessagesToDisplay(session.getMessages()));
      setStreamingText("");
      setScrollOffset(null);
      setCurrentSessionId(summary.sessionId);
      setOverlay("none");
    },
    [session],
  );

  useEffect(() => {
    if (startupChecked.current) return;
    startupChecked.current = true;
    const current = session.getModel();
    if (!hasProviderAuth(current.provider, settings)) {
      openApiKeyPrompt(current, "none");
    }
  }, [session, settings, openApiKeyPrompt]);

  useEffect(() => {
    const handler = (event: SessionEvent) => {
      switch (event.type) {
        case "user_message":
          followLatest();
          setDisplayMessages((prev) => [...prev, toDisplayMessage("user", event.content)]);
          setRunning(true);
          streamingRef.current = "";
          setStreamingText("");
          break;
        case "message_start":
          streamingRef.current = "";
          setStreamingText("");
          break;
        case "text_delta":
          streamingRef.current += event.delta;
          setStreamingText(streamingRef.current);
          break;
        case "tool_call":
          const partial = streamingRef.current;
          if (partial) {
            setDisplayMessages((prev) => [...prev, toDisplayMessage("assistant", partial)]);
            streamingRef.current = "";
            setStreamingText("");
          }
          break;
        case "tool_result":
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("tool", formatToolForDisplay(event.name, event.result), event.name),
          ]);
          break;
        case "turn_end":
          const final = streamingRef.current;
          if (final) {
            setDisplayMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.content.trim() === final.trim()) {
                return prev;
              }
              return [...prev, toDisplayMessage("assistant", final)];
            });
          }
          streamingRef.current = "";
          setStreamingText("");
          setRunning(false);
          break;
        case "error":
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("assistant", `Error: ${event.message}`),
          ]);
          streamingRef.current = "";
          setStreamingText("");
          setRunning(false);
          setPendingCommand(null);
          if (/Missing .*API_KEY/i.test(event.message)) {
            openApiKeyPrompt(model, "none");
          }
          break;
        case "permission_request":
          setPendingCommand(event.request);
          setOverlay("commandApproval");
          break;
        case "model_changed":
          setModel(event.model);
          break;
        case "session_title":
          setSessionListRefresh((v) => v + 1);
          break;
      }
    };
    session.on("event", handler);
    return () => {
      session.off("event", handler);
    };
  }, [session, model, openApiKeyPrompt, followLatest]);

  useMouseScroll(
    (direction) => {
      if (overlay !== "none") return;
      scrollBy(direction === "up" ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES);
    },
    { isActive: overlay === "none" && hasChat },
  );

  useAppInput(
    (input, key) => {
      if (overlay !== "none") return;

      if (key.escape && running) {
        session.abort();
        return;
      }

      const scrollUp =
        key.pageUp ||
        (key.upArrow && !key.ctrl && !key.meta) ||
        (input === "u" && key.ctrl);
      const scrollDown =
        key.pageDown ||
        (key.downArrow && !key.ctrl && !key.meta) ||
        (input === "d" && key.ctrl);

      if (scrollUp) {
        if (key.ctrl && input === "u") {
          scrollBy(-Math.max(1, Math.floor(viewportHeight / 2)));
        } else if (key.pageUp) {
          scrollPageUp();
        } else {
          scrollBy(-1);
        }
        return;
      }

      if (scrollDown) {
        if (key.ctrl && input === "d") {
          scrollBy(Math.max(1, Math.floor(viewportHeight / 2)));
        } else if (key.pageDown) {
          scrollPageDown();
        } else {
          scrollBy(1);
        }
        return;
      }

      if (input === "g" && key.ctrl) {
        followLatest();
      }
    },
    { isActive: overlay === "none" },
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (value === "/quit") {
        onQuit();
        exit();
        return;
      }
      if (value === "/new") {
        session.newSession();
        setDisplayMessages([]);
        setStreamingText("");
        setScrollOffset(null);
        setCurrentSessionId(session.getSessionId());
        return;
      }
      if (value === "/sessions") {
        setOverlay("sessions");
        return;
      }
      if (value === "/settings") {
        setOverlay("settings");
        return;
      }
      if (value.startsWith("/model")) {
        const parts = value.split(/\s+/);
        setModelFilter(parts[1] ?? undefined);
        setOverlay("model");
        return;
      }
      if (running) return;

      if (!hasProviderAuth(model.provider, settings)) {
        openApiKeyPrompt(model, "none");
        return;
      }

      await session.prompt(value);
    },
    [session, running, onQuit, exit, model, settings, openApiKeyPrompt],
  );

  const scrollHint =
    hasChat && maxScroll > 0
      ? following
        ? undefined
        : `↑ ${scrollTop} / ${maxScroll}`
      : undefined;

  return (
    <Box flexDirection="column" height={terminalRows}>
      {overlay === "sessions" ? (
        <SessionSelector
          theme={theme}
          currentSessionId={currentSessionId}
          viewportHeight={viewportHeight}
          contentWidth={contentWidth}
          refreshKey={sessionListRefresh}
          onSelect={loadSession}
          onClose={() => setOverlay("none")}
        />
      ) : hasChat ? (
        <ChatView
          messages={displayMessages}
          theme={theme}
          model={model}
          streamingText={streamingText}
          running={running}
          viewportHeight={viewportHeight}
          scrollTop={scrollTop}
          contentWidth={contentWidth}
        />
      ) : (
        <Box height={viewportHeight} overflow="hidden" flexShrink={0} paddingX={2}>
          <StartupBanner theme={theme} compact={suggestionCount > 0} />
        </Box>
      )}

      <Footer workdir={workdir} model={model} theme={theme} scrollHint={scrollHint} />

      {overlay === "none" && (
        <Box flexShrink={0}>
          <Editor
            theme={theme}
            model={model}
            disabled={running}
            running={running}
            maxSuggestions={maxSuggestions}
            onSuggestionCountChange={setSuggestionCount}
            onSubmit={handleSubmit}
          />
        </Box>
      )}

      {overlay === "model" && (
        <ModelSelector
          theme={theme}
          settings={settings}
          filter={modelFilter}
          onSelect={(m) => {
            if (!hasProviderAuth(m.provider, settings)) {
              openApiKeyPrompt(m, "model");
              return;
            }
            session.setModel(m);
            setModel(m);
            setOverlay("none");
            setModelFilter(undefined);
          }}
          onClose={() => {
            setOverlay("none");
            setModelFilter(undefined);
          }}
        />
      )}

      {overlay === "apiKey" && pendingModel && (
        <ApiKeyPrompt
          theme={theme}
          provider={pendingModel.provider}
          model={pendingModel}
          onSubmit={saveApiKey}
          onCancel={() => {
            setPendingModel(null);
            setOverlay(apiKeyReturnOverlay);
            setApiKeyReturnOverlay("none");
          }}
        />
      )}

      {overlay === "settings" && (
        <SettingsView
          theme={theme}
          settings={settings}
          onUpdate={(s) => {
            session.updateSettings(s);
            setSettings(s);
          }}
          onSetApiKey={(provider) => {
            openApiKeyPrompt(modelForProvider(provider, settings), "settings");
          }}
          onClose={() => setOverlay("none")}
        />
      )}

      {overlay === "commandApproval" && pendingCommand && (
        <CommandApprovalPrompt
          theme={theme}
          request={pendingCommand}
          onApprove={() => {
            session.respondToPermission(true);
            setPendingCommand(null);
            setOverlay("none");
          }}
          onDeny={() => {
            session.respondToPermission(false);
            setPendingCommand(null);
            setOverlay("none");
          }}
        />
      )}
    </Box>
  );
}
