import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, useApp } from "ink";
import type { AgentSession, SessionEvent, ContextUsageState } from "../agent/session.js";
import { ChatView } from "./ChatView.js";
import { Editor } from "./Editor.js";
import { Footer } from "./Footer.js";
import { ModelSelector } from "./ModelSelector.js";
import { ApiKeyPrompt } from "./ApiKeyPrompt.js";
import { SettingsView } from "./SettingsView.js";
import { SessionSelector } from "./SessionSelector.js";
import { ConnectView } from "./ConnectView.js";
import { hasProviderAuth, getDefaultModelForProvider } from "../providers/registry.js";
import type { Model, ProviderId } from "../providers/types.js";
import type { ChatMessage } from "../providers/types.js";
import { findModel } from "../config/models.js";
import type { Settings } from "../config/settings.js";
import { CommandApprovalPrompt } from "./CommandApprovalPrompt.js";
import { BrowserInteractionPrompt } from "./BrowserInteractionPrompt.js";
import type { PermissionRequest, InteractionRequest } from "../agent/loop.js";
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
  MIN_CHAT_ROWS,
  safeTerminalRows,
  slashSuggestionRows,
} from "./scroll.js";
import { useMouseScroll } from "./useMouseScroll.js";
import { WHEEL_SCROLL_LINES } from "./mouse.js";
import { SkillsView } from "./SkillsView.js";
import { discoverSkills } from "../agent/skills.js";
import {
  loadPlanSummary,
  clearPlan,
  clearLegacyGlobalPlan,
  buildPlanExecutionPrompt,
} from "../agent/tools/plan.js";
import type { AgentMode } from "../agent/mode.js";
import type { OrchestratorMode } from "../config/settings.js";
import { useAppInput } from "./useAppInput.js";
import { isModelCommand } from "./slash-commands.js";
import { sanitizeErrorForUser } from "../providers/openai-compat.js";
import { getLatestTracePath } from "../agent/orchestrator/trace.js";
import { checkForUpdate, type UpdateInfo } from "../version/check.js";
import { discoverProjectRules, formatProjectRulesSummary } from "../agent/project-rules.js";
import { formatPermissionRulesSummary } from "../agent/permissions.js";

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

type Overlay = "none" | "model" | "settings" | "connect" | "skills" | "apiKey" | "commandApproval" | "browserInteraction" | "sessions";

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
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
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
  const [agentMode, setAgentMode] = useState<AgentMode>(session.getAgentMode());
  const [orchestratorMode, setOrchestratorMode] = useState<OrchestratorMode>(
    session.getOrchestratorMode(),
  );
  const [model, setModel] = useState(session.getModel());
  const [running, setRunning] = useState(false);
  /** null = follow latest output */
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PermissionRequest | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<InteractionRequest | null>(null);
  const [toolProgress, setToolProgress] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(session.getSessionId());
  const [sessionListRefresh, setSessionListRefresh] = useState(0);
  const streamingRef = useRef("");
  const startupChecked = useRef(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageState>(() => session.getContextUsage());
  const [pendingPlanExecutionSummary, setPendingPlanExecutionSummary] = useState<string | null>(null);

  const theme = getTheme();

  const hasChat = displayMessages.length > 0 || streamingText.length > 0;
  const minMainRows = hasChat ? MIN_CHAT_ROWS : suggestionsOpen ? 1 : 0;
  const viewportHeight = chatViewportHeight(
    terminal.rows,
    slashSuggestionRows(suggestionsOpen ? 1 : 0),
    minMainRows,
  );

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
    void checkForUpdate().then(setUpdateInfo);
  }, []);

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
          setToolProgress("");
          break;
        case "tool_progress":
          setToolProgress(event.message);
          break;
        case "tool_result":
          setToolProgress("");
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("tool", formatToolForDisplay(event.name, event.result), event.name),
          ]);
          if (
            event.name === "plan" &&
            event.result.includes("Plan created.") &&
            session.getAgentMode() === "plan"
          ) {
            const summary = loadPlanSummary(session.getSessionId());
            if (summary) {
              setPendingPlanExecutionSummary(summary);
            }
          }
          break;
        case "delegation_start":
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage(
              "tool",
              `▶ ${event.workerId} #${event.runId}\n${event.task}`,
              `worker:${event.workerId}`,
            ),
          ]);
          break;
        case "delegation_end": {
          const badge =
            event.status === "success" ? "✓" : event.status === "error" ? "✗" : "⊘";
          const summary =
            event.summary.length > 600 ? event.summary.slice(0, 600) + "…" : event.summary;
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage(
              "tool",
              `${badge} ${event.workerId} #${event.runId} (${event.status})\n${summary}`,
              `worker:${event.workerId}:end`,
            ),
          ]);
          break;
        }
        case "agent_event": {
          const inner = event.event;
          if (inner.type === "tool_call") {
            setDisplayMessages((prev) => [
              ...prev,
              toDisplayMessage(
                "tool",
                `  ↳ ${formatToolForDisplay(inner.toolCall.name, inner.toolCall.arguments)}`,
                `${event.workerId}:${inner.toolCall.name}`,
              ),
            ]);
          } else if (inner.type === "tool_progress") {
            setToolProgress(inner.message);
          } else if (inner.type === "tool_result") {
            setDisplayMessages((prev) => [
              ...prev,
              toDisplayMessage(
                "tool",
                `  ↳ ${formatToolForDisplay(inner.name, inner.result)}`,
                `${event.workerId}:${inner.name}`,
              ),
            ]);
          }
          break;
        }
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
          if (pendingPlanExecutionSummary) {
            setDisplayMessages((prev) => [
              ...prev,
              toDisplayMessage(
                "assistant",
                "Plan created. Do you want me to execute it now?\n\nOptions: yes / no",
              ),
            ]);
          }
          streamingRef.current = "";
          setStreamingText("");
          setToolProgress("");
          setRunning(false);
          break;
        case "error": {
          const msg = sanitizeErrorForUser(event.message);
          if (!msg) {
            setRunning(false);
            setPendingCommand(null);
            break;
          }
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("assistant", `Error: ${msg}`),
          ]);
          streamingRef.current = "";
          setStreamingText("");
          setRunning(false);
          setPendingCommand(null);
          if (/Missing .*API_KEY/i.test(msg)) {
            openApiKeyPrompt(model, "none");
          }
          break;
        }
        case "permission_request":
          setPendingCommand(event.request);
          setOverlay("commandApproval");
          break;
        case "interaction_request":
          setPendingInteraction(event.request);
          setOverlay("browserInteraction");
          break;
        case "model_changed":
          setModel(event.model);
          setContextUsage(session.getContextUsage());
          break;
        case "compacting":
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("tool", "Compacting context…", "compaction"),
          ]);
          break;
        case "compaction_done":
          setContextUsage(session.getContextUsage());
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage(
              "tool",
              `Context compacted (${event.tokensBefore.toLocaleString()} → ${event.tokensAfter.toLocaleString()} tokens, ${event.reason})`,
              "compaction",
            ),
          ]);
          break;
        case "context_usage":
          setContextUsage(session.getContextUsage());
          break;
        case "agent_mode_changed":
          setAgentMode(event.mode);
          setSettings(session.getSettings());
          break;
        case "orchestrator_mode_changed":
          setOrchestratorMode(event.mode);
          setSettings(session.getSettings());
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
  }, [session, model, openApiKeyPrompt, followLatest, pendingPlanExecutionSummary]);

  useMouseScroll(
    (direction) => {
      if (overlay !== "none" || suggestionsOpen) return;
      scrollBy(direction === "up" ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES);
    },
    { isActive: overlay === "none" && hasChat },
  );

  useAppInput(
    (input, key) => {
      if (overlay !== "none" || suggestionsOpen) return;

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
        setPendingPlanExecutionSummary(null);
        setCurrentSessionId(session.getSessionId());
        return;
      }
      if (pendingPlanExecutionSummary) {
        const answer = value.trim().toLowerCase();
        if (answer === "yes" || answer === "y") {
          session.switchToAgentMode("build");
          setPendingPlanExecutionSummary(null);
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("user", value),
            toDisplayMessage("assistant", "Approved. Switched to Build mode and starting implementation."),
          ]);
          await session.prompt(buildPlanExecutionPrompt(pendingPlanExecutionSummary));
          return;
        }
        if (answer === "no" || answer === "n") {
          setPendingPlanExecutionSummary(null);
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("user", value),
            toDisplayMessage("assistant", "Okay, staying in Plan mode."),
          ]);
          return;
        }
      }
      if (value === "/sessions") {
        setOverlay("sessions");
        return;
      }
      if (value === "/settings") {
        setOverlay("settings");
        return;
      }
      if (value === "/connect") {
        setOverlay("connect");
        return;
      }
      if (value === "/build") {
        session.switchToAgentMode("build");
        return;
      }
      if (value === "/plan") {
        session.switchToAgentMode("plan");
        return;
      }
      if (value === "/boss") {
        session.toggleOrchestratorMode();
        return;
      }
      if (value === "/trace") {
        const tracePath = getLatestTracePath(session.getSessionId());
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            tracePath
              ? `Latest worker trace:\n${tracePath}`
              : "No worker traces yet. Traces are written when boss mode delegates to workers.",
          ),
        ]);
        return;
      }
      if (value === "/tasks clear") {
        clearPlan(session.getSessionId());
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", "Plan cleared for this session."),
        ]);
        return;
      }
      if (value === "/tasks") {
        const summary = loadPlanSummary(session.getSessionId());
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            summary || "No active plan. Ask the agent to create one, or it will use the plan tool automatically.",
          ),
        ]);
        return;
      }
      if (value === "/rules") {
        const rules = discoverProjectRules(workdir, settings);
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", formatProjectRulesSummary(rules)),
        ]);
        return;
      }
      if (value === "/permissions") {
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", formatPermissionRulesSummary(workdir, settings)),
        ]);
        return;
      }
      if (value === "/compact" || value.startsWith("/compact ")) {
        const instructions = value.startsWith("/compact ")
          ? value.slice("/compact ".length).trim()
          : undefined;
        setDisplayMessages((prev) => [...prev, toDisplayMessage("user", value)]);
        const result = await session.compact({
          reason: "manual",
          customInstructions: instructions || undefined,
        });
        if (!result.ok) {
          setDisplayMessages((prev) => [
            ...prev,
            toDisplayMessage("assistant", result.message),
          ]);
        }
        return;
      }
      if (value === "/skills") {
        setOverlay("skills");
        return;
      }
      if (value.startsWith("/skill add ")) {
        setDisplayMessages((prev) => [
          ...prev,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            "Use /skills to install skills, or run: agent skills add <owner/repo>",
          ),
        ]);
        return;
      }
      if (isModelCommand(value)) {
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
    [
      session,
      running,
      onQuit,
      exit,
      model,
      settings,
      openApiKeyPrompt,
      workdir,
      pendingPlanExecutionSummary,
    ],
  );

  const skillOptions = useMemo(
    () => discoverSkills(workdir, settings).map((s) => ({ name: s.name, description: s.description })),
    [workdir, settings],
  );

  const projectRulesCount = useMemo(
    () => discoverProjectRules(workdir, settings).files.length,
    [workdir, settings],
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
      ) : overlay === "skills" ? (
        <SkillsView
          theme={theme}
          settings={settings}
          workdir={workdir}
          viewportHeight={viewportHeight}
          contentWidth={contentWidth}
          onClose={() => setOverlay("none")}
        />
      ) : overlay === "settings" ? (
        <SettingsView
          theme={theme}
          settings={settings}
          workdir={workdir}
          viewportHeight={viewportHeight}
          contentWidth={contentWidth}
          onUpdate={(s) => {
            session.updateSettings(s);
            setSettings(s);
          }}
          onSetApiKey={(provider) => {
            openApiKeyPrompt(modelForProvider(provider, settings), "settings");
          }}
          onClose={() => setOverlay("none")}
        />
      ) : overlay === "connect" ? (
        <ConnectView
          theme={theme}
          settings={settings}
          viewportHeight={viewportHeight}
          contentWidth={contentWidth}
          onSave={(s) => {
            session.updateSettings(s);
            setSettings(s);
          }}
          onClose={() => setOverlay("none")}
        />
      ) : overlay === "model" ? (
        <ModelSelector
          theme={theme}
          settings={settings}
          filter={modelFilter}
          viewportHeight={viewportHeight}
          contentWidth={contentWidth}
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
      ) : overlay === "apiKey" && pendingModel ? (
        <Box height={viewportHeight} flexShrink={0} overflow="hidden" paddingX={2}>
          <ApiKeyPrompt
            theme={theme}
            provider={pendingModel.provider}
            model={pendingModel}
            contentWidth={contentWidth}
            onSubmit={saveApiKey}
            onCancel={() => {
              setPendingModel(null);
              setOverlay(apiKeyReturnOverlay);
              setApiKeyReturnOverlay("none");
            }}
          />
        </Box>
      ) : overlay === "commandApproval" && pendingCommand ? (
        <Box height={viewportHeight} flexShrink={0} overflow="hidden" paddingX={2}>
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
        </Box>
      ) : overlay === "browserInteraction" && pendingInteraction ? (
        <Box height={viewportHeight} flexShrink={0} overflow="hidden" paddingX={2}>
          <BrowserInteractionPrompt
            theme={theme}
            request={pendingInteraction}
            onContinue={(value) => {
              session.respondToInteraction(value);
              setPendingInteraction(null);
              setOverlay("none");
            }}
          />
        </Box>
      ) : hasChat ? (
        <ChatView
          messages={displayMessages}
          theme={theme}
          model={model}
          streamingText={streamingText}
          toolProgress={toolProgress}
          running={running}
          viewportHeight={viewportHeight}
          scrollTop={scrollTop}
          contentWidth={contentWidth}
        />
      ) : (
        <Box height={viewportHeight} overflow="hidden" flexShrink={0} paddingX={2}>
          <StartupBanner
            theme={theme}
            compact={suggestionsOpen}
            updateInfo={updateInfo}
            projectRulesCount={projectRulesCount}
          />
        </Box>
      )}

      <Footer
        workdir={workdir}
        model={model}
        theme={theme}
        scrollHint={scrollHint}
        orchestratorMode={orchestratorMode}
        updateInfo={updateInfo}
        contextUsage={contextUsage}
      />

      {overlay === "none" && (
        <Box flexShrink={0}>
          <Editor
            theme={theme}
            model={model}
            agentMode={agentMode}
            orchestratorMode={orchestratorMode}
            skills={skillOptions}
            contentWidth={contentWidth}
            disabled={running}
            running={running}
            onSuggestionsOpenChange={setSuggestionsOpen}
            onModeCycle={(direction) => session.cycleAgentMode(direction)}
            onSubmit={handleSubmit}
          />
        </Box>
      )}
    </Box>
  );
}
