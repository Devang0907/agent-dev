import { createSignal, onCleanup } from "solid-js";
import type { AgentSession, SessionEvent, ContextUsageState } from "../agent/session.js";
import type { ChatMessage } from "../providers/types.js";
import type { Model, ProviderId } from "../providers/types.js";
import type { Settings, OrchestratorMode } from "../config/settings.js";
import type { AgentMode } from "../agent/mode.js";
import type { PermissionRequest, InteractionRequest } from "../agent/loop.js";
import type { SessionSummary } from "../session/manager.js";
import type { UpdateInfo } from "../version/check.js";
import { formatToolForDisplay } from "./format-tool.js";
import { toDisplayMessage, resetMessageIds, type DisplayMessage } from "./display.js";
import { sanitizeErrorForUser } from "../providers/openai-compat.js";
import { hasProviderAuth, getDefaultModelForProvider } from "../providers/registry.js";
import { findModel } from "../config/models.js";
import { discoverSkills } from "../agent/skills.js";
import type { SkillNameOption } from "./commands/slash-commands.js";
import { discoverProjectRules } from "../agent/project-rules.js";
import { loadPlanTasks, loadPlanSummary, clearPlan } from "../agent/tools/plan.js";
import type { PlanTask } from "../agent/tools/plan.js";
import { getLatestTracePath } from "../agent/orchestrator/trace.js";
import { formatProjectRulesSummary } from "../agent/project-rules.js";
import { formatPermissionRulesSummary } from "../agent/permissions.js";
import { checkForUpdate } from "../version/check.js";

export type DialogType =
  | "none"
  | "model"
  | "settings"
  | "connect"
  | "skills"
  | "apiKey"
  | "sessions"
  | "palette";

export interface SessionBridgeState {
  displayMessages: DisplayMessage[];
  streamingText: string;
  toolProgress: string;
  running: boolean;
  dialog: DialogType;
  modelFilter?: string;
  pendingModel: Model | null;
  apiKeyReturnDialog: DialogType;
  settings: Settings;
  agentMode: AgentMode;
  orchestratorMode: OrchestratorMode;
  model: Model;
  currentSessionId: string;
  sessionListRefresh: number;
  pendingCommand: PermissionRequest | null;
  pendingInteraction: InteractionRequest | null;
  contextUsage: ContextUsageState;
  updateInfo: UpdateInfo | null;
  planTasks: PlanTask[];
  skillOptions: SkillNameOption[];
  projectRulesCount: number;
  route: "home" | "session";
}

function chatMessagesToDisplay(messages: ChatMessage[]): DisplayMessage[] {
  resetMessageIds();
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

function modelForProvider(provider: ProviderId, settings: Settings): Model {
  const current = findModel(settings.defaultProvider, settings.defaultModel);
  if (current?.provider === provider) return current;
  return getDefaultModelForProvider(provider)!;
}

export function createSessionBridge(session: AgentSession, workdir: string) {
  const streamingRef = { current: "" };

  const [state, setState] = createSignal<SessionBridgeState>({
    displayMessages: chatMessagesToDisplay(session.getMessages()),
    streamingText: "",
    toolProgress: "",
    running: false,
    dialog: "none",
    pendingModel: null,
    apiKeyReturnDialog: "none",
    settings: session.getSettings(),
    agentMode: session.getAgentMode(),
    orchestratorMode: session.getOrchestratorMode(),
    model: session.getModel(),
    currentSessionId: session.getSessionId(),
    sessionListRefresh: 0,
    pendingCommand: null,
    pendingInteraction: null,
    contextUsage: session.getContextUsage(),
    updateInfo: null,
    planTasks: loadPlanTasks(session.getSessionId()),
    skillOptions: discoverSkills(workdir, session.getSettings()).map((s) => ({
      name: s.name,
      description: s.description,
    })),
    projectRulesCount: discoverProjectRules(workdir, session.getSettings()).files.length,
    route:
      session.getMessages().filter((m) => m.role === "user" || m.role === "assistant").length > 0
        ? "session"
        : "home",
  });

  const patch = (partial: Partial<SessionBridgeState>) => {
    setState((s) => ({ ...s, ...partial }));
  };

  const refreshPlan = () => patch({ planTasks: loadPlanTasks(session.getSessionId()) });

  const refreshSkills = () =>
    patch({
      skillOptions: discoverSkills(workdir, session.getSettings()).map((s) => ({
        name: s.name,
        description: s.description,
      })),
    });

  const openApiKeyPrompt = (target: Model, returnTo: DialogType = "none") => {
    patch({ pendingModel: target, apiKeyReturnDialog: returnTo, dialog: "apiKey" });
  };

  const saveApiKey = (apiKey: string) => {
    const s = state();
    if (!s.pendingModel) return;
    const updated = {
      ...s.settings,
      apiKeys: { ...s.settings.apiKeys, [s.pendingModel.provider]: apiKey },
    };
    session.updateSettings(updated);
    session.setModel(s.pendingModel);
    patch({
      settings: updated,
      model: s.pendingModel,
      pendingModel: null,
      dialog: s.apiKeyReturnDialog,
      apiKeyReturnDialog: "none",
      modelFilter: undefined,
    });
  };

  const loadSession = (summary: SessionSummary) => {
    session.loadSession(summary.sessionId);
    patch({
      displayMessages: chatMessagesToDisplay(session.getMessages()),
      streamingText: "",
      currentSessionId: summary.sessionId,
      dialog: "none",
      route: "session",
      planTasks: loadPlanTasks(summary.sessionId),
    });
  };

  void checkForUpdate().then((info) => patch({ updateInfo: info }));

  if (!hasProviderAuth(session.getModel().provider, session.getSettings())) {
    openApiKeyPrompt(session.getModel(), "none");
  }

  const handler = (event: SessionEvent) => {
    const s = state();
    switch (event.type) {
      case "user_message":
        patch({
          displayMessages: [...s.displayMessages, toDisplayMessage("user", event.content)],
          running: true,
          streamingText: "",
          route: "session",
        });
        streamingRef.current = "";
        break;
      case "message_start":
        streamingRef.current = "";
        patch({ streamingText: "" });
        break;
      case "text_delta":
        streamingRef.current += event.delta;
        patch({ streamingText: streamingRef.current });
        break;
      case "tool_call": {
        const partial = streamingRef.current;
        if (partial) {
          patch({
            displayMessages: [...s.displayMessages, toDisplayMessage("assistant", partial)],
            streamingText: "",
          });
          streamingRef.current = "";
        }
        patch({ toolProgress: "" });
        break;
      }
      case "tool_progress":
        patch({ toolProgress: event.message });
        break;
      case "tool_result":
        patch({
          toolProgress: "",
          displayMessages: [
            ...s.displayMessages,
            toDisplayMessage("tool", formatToolForDisplay(event.name, event.result), event.name),
          ],
        });
        if (event.name === "plan") refreshPlan();
        break;
      case "delegation_start":
        patch({
          displayMessages: [
            ...s.displayMessages,
            toDisplayMessage(
              "tool",
              `▶ ${event.workerId} #${event.runId}\n${event.task}`,
              `worker:${event.workerId}`,
            ),
          ],
        });
        break;
      case "delegation_end": {
        const badge = event.status === "success" ? "✓" : event.status === "error" ? "✗" : "⊘";
        const summary =
          event.summary.length > 600 ? event.summary.slice(0, 600) + "…" : event.summary;
        patch({
          displayMessages: [
            ...s.displayMessages,
            toDisplayMessage(
              "tool",
              `${badge} ${event.workerId} #${event.runId} (${event.status})\n${summary}`,
              `worker:${event.workerId}:end`,
            ),
          ],
        });
        break;
      }
      case "agent_event": {
        const inner = event.event;
        if (inner.type === "tool_call") {
          patch({
            displayMessages: [
              ...s.displayMessages,
              toDisplayMessage(
                "tool",
                `  ↳ ${formatToolForDisplay(inner.toolCall.name, inner.toolCall.arguments)}`,
                `${event.workerId}:${inner.toolCall.name}`,
              ),
            ],
          });
        } else if (inner.type === "tool_progress") {
          patch({ toolProgress: inner.message });
        } else if (inner.type === "tool_result") {
          patch({
            displayMessages: [
              ...s.displayMessages,
              toDisplayMessage(
                "tool",
                `  ↳ ${formatToolForDisplay(inner.name, inner.result)}`,
                `${event.workerId}:${inner.name}`,
              ),
            ],
          });
        }
        break;
      }
      case "turn_end": {
        const final = streamingRef.current;
        if (final) {
          const msgs = s.displayMessages;
          const last = msgs[msgs.length - 1];
          if (!(last?.role === "assistant" && last.content.trim() === final.trim())) {
            patch({
              displayMessages: [...msgs, toDisplayMessage("assistant", final)],
            });
          }
        }
        streamingRef.current = "";
        patch({ streamingText: "", toolProgress: "", running: false });
        refreshPlan();
        break;
      }
      case "error": {
        const msg = sanitizeErrorForUser(event.message);
        if (!msg) {
          patch({ running: false, pendingCommand: null });
          break;
        }
        patch({
          displayMessages: [...s.displayMessages, toDisplayMessage("assistant", `Error: ${msg}`)],
          streamingText: "",
          running: false,
          pendingCommand: null,
        });
        streamingRef.current = "";
        if (/Missing .*API_KEY/i.test(msg)) {
          openApiKeyPrompt(s.model, "none");
        }
        break;
      }
      case "permission_request":
        patch({ pendingCommand: event.request, dialog: "none" });
        break;
      case "interaction_request":
        patch({ pendingInteraction: event.request, dialog: "none" });
        break;
      case "model_changed":
        patch({ model: event.model, contextUsage: session.getContextUsage() });
        break;
      case "compacting":
        patch({
          displayMessages: [
            ...s.displayMessages,
            toDisplayMessage("tool", "Compacting context…", "compaction"),
          ],
        });
        break;
      case "compaction_done":
        patch({
          contextUsage: session.getContextUsage(),
          displayMessages: [
            ...s.displayMessages,
            toDisplayMessage(
              "tool",
              `Context compacted (${event.tokensBefore.toLocaleString()} → ${event.tokensAfter.toLocaleString()} tokens, ${event.reason})`,
              "compaction",
            ),
          ],
        });
        break;
      case "context_usage":
        patch({ contextUsage: session.getContextUsage() });
        break;
      case "agent_mode_changed":
        patch({ agentMode: event.mode, settings: session.getSettings() });
        break;
      case "orchestrator_mode_changed":
        patch({ orchestratorMode: event.mode, settings: session.getSettings() });
        break;
      case "session_title":
        patch({ sessionListRefresh: s.sessionListRefresh + 1 });
        break;
    }
  };

  session.on("event", handler);
  onCleanup(() => session.off("event", handler));

  const handleSlash = async (value: string, onQuit: () => void): Promise<boolean> => {
    const s = state();
    if (value === "/quit") {
      onQuit();
      return true;
    }
    if (value === "/new") {
      session.newSession();
      patch({
        displayMessages: [],
        streamingText: "",
        currentSessionId: session.getSessionId(),
        route: "home",
        planTasks: [],
      });
      return true;
    }
    if (value === "/sessions") {
      patch({ dialog: "sessions" });
      return true;
    }
    if (value === "/settings") {
      patch({ dialog: "settings" });
      return true;
    }
    if (value === "/connect") {
      patch({ dialog: "connect" });
      return true;
    }
    if (value === "/build") {
      session.setAgentMode("build");
      patch({ agentMode: "build" });
      return true;
    }
    if (value === "/plan") {
      session.setAgentMode("plan");
      patch({ agentMode: "plan" });
      return true;
    }
    if (value === "/boss") {
      session.toggleOrchestratorMode();
      patch({ orchestratorMode: session.getOrchestratorMode(), settings: session.getSettings() });
      return true;
    }
    if (value === "/trace") {
      const tracePath = getLatestTracePath(session.getSessionId());
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            tracePath
              ? `Latest worker trace:\n${tracePath}`
              : "No worker traces yet. Traces are written when boss mode delegates to workers.",
          ),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/tasks clear") {
      clearPlan(session.getSessionId());
      refreshPlan();
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", "Plan cleared for this session."),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/tasks") {
      const summary = loadPlanSummary(session.getSessionId());
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            summary || "No active plan. Ask the agent to create one, or it will use the plan tool automatically.",
          ),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/rules") {
      const rules = discoverProjectRules(workdir, s.settings);
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", formatProjectRulesSummary(rules)),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/permissions") {
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage("assistant", formatPermissionRulesSummary(workdir, s.settings)),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/compact" || value.startsWith("/compact ")) {
      const instructions = value.startsWith("/compact ")
        ? value.slice("/compact ".length).trim()
        : undefined;
      patch({
        displayMessages: [...s.displayMessages, toDisplayMessage("user", value)],
        route: "session",
      });
      const result = await session.compact({
        reason: "manual",
        customInstructions: instructions || undefined,
      });
      if (!result.ok) {
        patch({
          displayMessages: [
            ...state().displayMessages,
            toDisplayMessage("assistant", result.message),
          ],
        });
      }
      return true;
    }
    if (value === "/skills") {
      patch({ dialog: "skills" });
      refreshSkills();
      return true;
    }
    if (value.startsWith("/skill add ")) {
      patch({
        displayMessages: [
          ...s.displayMessages,
          toDisplayMessage("user", value),
          toDisplayMessage(
            "assistant",
            "Use /skills to install skills, or run: agent skills add <owner/repo>",
          ),
        ],
        route: "session",
      });
      return true;
    }
    if (value === "/m" || value === "/model" || value.startsWith("/m ") || value.startsWith("/model ")) {
      const parts = value.split(/\s+/);
      patch({ modelFilter: parts[1], dialog: "model" });
      return true;
    }
    return false;
  };

  const submitPrompt = async (value: string, onQuit: () => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (await handleSlash(trimmed, onQuit)) return;
    const s = state();
    if (s.running) return;
    if (!hasProviderAuth(s.model.provider, s.settings)) {
      openApiKeyPrompt(s.model, "none");
      return;
    }
    await session.prompt(trimmed);
  };

  return {
    state,
    patch,
    session,
    workdir,
    submitPrompt,
    openApiKeyPrompt,
    saveApiKey,
    loadSession,
    modelForProvider,
    refreshSkills,
    refreshPlan,
  };
}

export type SessionBridge = ReturnType<typeof createSessionBridge>;
