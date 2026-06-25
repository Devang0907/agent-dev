import { EventEmitter } from "node:events";
import type { ChatMessage, Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { findModel } from "../config/models.js";
import { setDefaultModel, saveSettings, setAgentMode, setOrchestratorMode } from "../config/settings.js";
import type { OrchestratorMode } from "../config/settings.js";
import { getAvailableModels, getDefaultModelForProvider } from "../providers/registry.js";
import { runAgentLoop, type AgentEvent, type PermissionRequest, type InteractionRequest } from "./loop.js";
import { resolveSkillCommand } from "./skills.js";
import type { AgentMode } from "./mode.js";
import { buildSwitchReminder } from "./mode.js";
import { buildBossSystemPrompt } from "./orchestrator/boss-prompt.js";
import { BOSS_TOOL_NAMES } from "./orchestrator/workers.js";
import {
  setDelegationContext,
  MAX_DELEGATIONS_PER_TURN,
} from "./orchestrator/context.js";
import { clearLegacyGlobalPlan } from "./tools/plan.js";
import { closeBrowserSession } from "./tools/browser/session.js";
import { stopBackgroundProcesses } from "./tools/shell.js";
import { SessionManager } from "../session/manager.js";
import type { CompactionReason } from "../session/manager.js";
import { generateSessionTitle, fallbackTitle } from "../session/title.js";
import {
  runCompaction,
  estimateContextTokens,
  getContextWindow,
  shouldCompact,
  formatTokenCount,
} from "./compaction/index.js";
import { getCompactionSettings } from "../config/settings.js";

export interface ContextUsageState {
  tokens: number;
  window: number;
  percent: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type SessionEvent =
  | AgentEvent
  | { type: "user_message"; content: string }
  | { type: "model_changed"; model: Model }
  | { type: "agent_mode_changed"; mode: AgentMode }
  | { type: "orchestrator_mode_changed"; mode: OrchestratorMode }
  | { type: "session_title"; title: string }
  | { type: "permission_request"; request: PermissionRequest }
  | { type: "interaction_request"; request: InteractionRequest }
  | { type: "compacting" }
  | {
      type: "compaction_done";
      tokensBefore: number;
      tokensAfter: number;
      summaryPreview: string;
      reason: CompactionReason;
    };

export class AgentSession extends EventEmitter {
  private messages: ChatMessage[] = [];
  private model: Model;
  private settings: Settings;
  private workdir: string;
  private sessionManager: SessionManager;
  private abortController?: AbortController;
  private running = false;
  private pendingPermission?: (approved: boolean) => void;
  private pendingInteraction?: (value: string | null) => void;
  private lastLoopMode: AgentMode = "build";
  private contextUsage: ContextUsageState = { tokens: 0, window: 128_000, percent: 0 };
  private lastStreamUsage?: { inputTokens?: number; outputTokens?: number };
  private compactedThisTurn = false;

  constructor(
    settings: Settings,
    sessionManager: SessionManager,
    workdir: string,
    initialModel?: Model,
  ) {
    super();
    this.settings = settings;
    this.sessionManager = sessionManager;
    this.workdir = workdir;
    this.messages = sessionManager.getMessages();

    const available = getAvailableModels(settings);
    const fromSettings = findModel(settings.defaultProvider, settings.defaultModel);
    this.model =
      initialModel ??
      (fromSettings && available.some((m) => m.provider === fromSettings.provider && m.id === fromSettings.id)
        ? fromSettings
        : available[0] ?? findModel("free", "meta-llama/llama-3.3-70b-instruct:free")!);
    this.lastLoopMode = this.settings.agentMode ?? "build";
    this.refreshContextUsage();
  }

  getContextUsage(): ContextUsageState {
    return { ...this.contextUsage };
  }

  private refreshContextUsage(lastUsage?: { inputTokens?: number; outputTokens?: number }): void {
    const ctx = this.sessionManager.getContextMessages();
    const estimate = estimateContextTokens(ctx, lastUsage ?? this.lastStreamUsage);
    const window = getContextWindow(this.model);
    this.contextUsage = {
      tokens: estimate.tokens,
      window,
      percent: window > 0 ? Math.min(100, Math.round((estimate.tokens / window) * 100)) : 0,
      inputTokens: lastUsage?.inputTokens ?? this.lastStreamUsage?.inputTokens,
      outputTokens: lastUsage?.outputTokens ?? this.lastStreamUsage?.outputTokens,
    };
  }

  async compact(options?: {
    customInstructions?: string;
    reason?: CompactionReason;
  }): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
    if (this.running && options?.reason === "manual") {
      return { ok: false, message: "Cannot compact while the agent is running." };
    }

    const reason = options?.reason ?? "manual";
    this.emit("event", { type: "compacting" } satisfies SessionEvent);

    try {
      const result = await runCompaction({
        sessionManager: this.sessionManager,
        model: this.model,
        settings: this.settings,
        reason,
        customInstructions: options?.customInstructions,
        signal: this.abortController?.signal,
      });

      this.refreshContextUsage();
      const preview =
        result.summary.length > 400 ? result.summary.slice(0, 400) + "…" : result.summary;
      this.emit("event", {
        type: "compaction_done",
        tokensBefore: result.tokensBefore,
        tokensAfter: result.tokensAfter,
        summaryPreview: preview,
        reason,
      } satisfies SessionEvent);

      const message = `Context compacted (${formatTokenCount(result.tokensBefore)} → ${formatTokenCount(result.tokensAfter)} tokens). Full history preserved in session file.`;
      return { ok: true, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  }

  private async maybeAutoCompact(): Promise<void> {
    if (this.compactedThisTurn) return;
    const compactionSettings = getCompactionSettings(this.settings);
    const ctx = this.sessionManager.getContextMessages();
    const tokens = estimateContextTokens(ctx, this.lastStreamUsage).tokens;
    const window = getContextWindow(this.model);
    if (!shouldCompact(tokens, window, compactionSettings)) return;

    const result = await this.compact({ reason: "threshold" });
    if (result.ok) {
      this.compactedThisTurn = true;
    }
  }

  private getLoopMessages(): ChatMessage[] {
    return this.sessionManager.getContextMessages();
  }

  getAgentMode(): AgentMode {
    return this.settings.agentMode ?? "build";
  }

  setAgentMode(mode: AgentMode): void {
    const bossActive = this.getOrchestratorMode() === "boss";
    const sameMode = this.settings.agentMode === mode;
    if (sameMode && !bossActive) return;

    if (bossActive) {
      this.setOrchestratorMode("off");
    }
    if (sameMode) return;

    this.settings = setAgentMode(this.settings, mode);
    this.emit("event", { type: "agent_mode_changed", mode } satisfies SessionEvent);
  }

  cycleAgentMode(direction: 1 | -1 = 1): AgentMode {
    const modes: AgentMode[] = ["build", "plan"];
    const current = this.getAgentMode();
    const idx = modes.indexOf(current);
    const next = modes[(idx + direction + modes.length) % modes.length]!;
    this.setAgentMode(next);
    return next;
  }

  getOrchestratorMode(): OrchestratorMode {
    return this.settings.orchestratorMode ?? "off";
  }

  setOrchestratorMode(mode: OrchestratorMode): void {
    if (this.settings.orchestratorMode === mode) return;
    this.settings = setOrchestratorMode(this.settings, mode);
    this.emit("event", { type: "orchestrator_mode_changed", mode } satisfies SessionEvent);
  }

  toggleOrchestratorMode(): OrchestratorMode {
    const next = this.getOrchestratorMode() === "boss" ? "off" : "boss";
    this.setOrchestratorMode(next);
    return next;
  }

  private isBossMode(): boolean {
    return this.getOrchestratorMode() === "boss";
  }

  private async runLoop(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const isBoss = this.isBossMode();

    if (isBoss) {
      setDelegationContext({
        sessionId: this.getSessionId(),
        model: this.model,
        settings: this.settings,
        workdir: this.workdir,
        signal: this.abortController?.signal,
        onEvent: (event) => this.emit("event", event),
        onPermissionRequest: (request) => this.requestCommandPermission(request),
        onInteractionRequest: (request) => this.requestInteraction(request),
        delegationCount: 0,
        maxDelegations: MAX_DELEGATIONS_PER_TURN,
      });
    }

    try {
      return await runAgentLoop({
        model: this.model,
        messages,
        settings: this.settings,
        workdir: this.workdir,
        agentMode: isBoss ? "build" : this.getAgentMode(),
        modeSwitchNote: isBoss ? undefined : this.modeSwitchNote(),
        systemPrompt: isBoss ? buildBossSystemPrompt() : undefined,
        allowedTools: isBoss ? [...BOSS_TOOL_NAMES] : undefined,
        signal: this.abortController?.signal,
        onEvent: (event) => {
          if (event.type === "context_usage") {
            this.lastStreamUsage = {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
            };
            this.refreshContextUsage(this.lastStreamUsage);
          }
          this.emit("event", event);
        },
        onPermissionRequest: (request) => this.requestCommandPermission(request),
        onInteractionRequest: (request) => this.requestInteraction(request),
        sessionId: this.getSessionId(),
        onContextOverflow: async () => {
          const result = await this.compact({ reason: "overflow" });
          if (result.ok) {
            this.compactedThisTurn = true;
            return true;
          }
          return false;
        },
      });
    } finally {
      if (isBoss) setDelegationContext(null);
    }
  }

  private modeSwitchNote(): string | undefined {
    const current = this.getAgentMode();
    if (this.lastLoopMode === "plan" && current === "build") {
      return buildSwitchReminder();
    }
    return undefined;
  }

  private finishLoopMode(): void {
    this.lastLoopMode = this.getAgentMode();
  }

  getModel(): Model {
    return this.model;
  }

  getSettings(): Settings {
    return this.settings;
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getSessionId(): string {
    return this.sessionManager.sessionId;
  }

  isRunning(): boolean {
    return this.running;
  }

  setModel(model: Model): void {
    this.model = model;
    this.settings = setDefaultModel(this.settings, model.provider, model.id);
    this.sessionManager.appendModelChange(model);
    this.refreshContextUsage();
    this.emit("event", { type: "model_changed", model } satisfies SessionEvent);
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(settings);
  }

  abort(): void {
    this.abortController?.abort();
    this.resolvePermission(false);
    this.resolveInteraction(null);
    void closeBrowserSession(this.getSessionId());
    stopBackgroundProcesses();
  }

  respondToPermission(approved: boolean): void {
    this.resolvePermission(approved);
  }

  respondToInteraction(value?: string): void {
    this.resolveInteraction(value ?? null);
  }

  private resolvePermission(approved: boolean): void {
    const resolve = this.pendingPermission;
    if (resolve) {
      this.pendingPermission = undefined;
      resolve(approved);
    }
  }

  private requestCommandPermission(request: PermissionRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingPermission = resolve;
      this.emit("event", { type: "permission_request", request } satisfies SessionEvent);
    });
  }

  private requestInteraction(request: InteractionRequest): Promise<string | null> {
    return new Promise((resolve) => {
      this.pendingInteraction = resolve;
      this.emit("event", { type: "interaction_request", request } satisfies SessionEvent);
    });
  }

  private resolveInteraction(value: string | null): void {
    const resolve = this.pendingInteraction;
    if (resolve) {
      this.pendingInteraction = undefined;
      resolve(value);
    }
  }

  async prompt(content: string): Promise<void> {
    if (this.running) return;

    const skillCommand = resolveSkillCommand(content, this.workdir, this.settings);
    if (skillCommand.type === "list") return;
    if (skillCommand.type === "error") {
      this.running = true;
      const userMsg: ChatMessage = { role: "user", content };
      this.messages.push(userMsg);
      this.sessionManager.appendMessage(userMsg);
      this.emit("event", { type: "user_message", content } satisfies SessionEvent);
      this.emit("event", { type: "message_start", role: "assistant" } satisfies AgentEvent);
      this.emit("event", { type: "text_delta", delta: skillCommand.message } satisfies AgentEvent);
      const assistantMsg: ChatMessage = { role: "assistant", content: skillCommand.message };
      this.messages.push(assistantMsg);
      this.sessionManager.appendMessage(assistantMsg);
      this.emit("event", { type: "turn_end" } satisfies AgentEvent);
      this.running = false;
      this.sessionManager.saveAsLast();
      return;
    }
    if (skillCommand.type === "prompt") {
      const displayContent = content;
      const agentContent = skillCommand.content;
      this.running = true;

      const isFirstMessage = this.messages.length === 0;
      const userMsg: ChatMessage = { role: "user", content: displayContent };
      this.messages.push(userMsg);
      this.sessionManager.appendMessage(userMsg);
      this.emit("event", { type: "user_message", content: displayContent } satisfies SessionEvent);

      if (isFirstMessage) {
        void this.generateSessionTitle(displayContent);
      }

      this.abortController = new AbortController();
      this.compactedThisTurn = false;

      try {
        await this.maybeAutoCompact();
        const loopMessages = [
          ...this.getLoopMessages().slice(0, -1),
          { role: "user" as const, content: agentContent },
        ];
        const newMessages = await this.runLoop(loopMessages);

        for (const msg of newMessages) {
          if (msg.role !== "user") {
            this.messages.push(msg);
            this.sessionManager.appendMessage(msg);
          }
        }
      } finally {
        this.finishLoopMode();
        this.running = false;
        this.abortController = undefined;
        this.sessionManager.saveAsLast();
      }
      return;
    }

    this.running = true;

    const isFirstMessage = this.messages.length === 0;
    const userMsg: ChatMessage = { role: "user", content };
    this.messages.push(userMsg);
    this.sessionManager.appendMessage(userMsg);
    this.emit("event", { type: "user_message", content } satisfies SessionEvent);

    if (isFirstMessage) {
      void this.generateSessionTitle(content);
    }

    this.abortController = new AbortController();
    this.compactedThisTurn = false;

    try {
      await this.maybeAutoCompact();
      const newMessages = await this.runLoop(this.getLoopMessages());

      for (const msg of newMessages) {
        if (msg.role !== "user") {
          this.messages.push(msg);
          this.sessionManager.appendMessage(msg);
        }
      }
    } finally {
      this.finishLoopMode();
      this.running = false;
      this.abortController = undefined;
      this.sessionManager.saveAsLast();
    }
  }

  newSession(): void {
    if (this.running) return;
    stopBackgroundProcesses();
    this.messages = [];
    this.sessionManager = new SessionManager(undefined, this.workdir);
    this.lastStreamUsage = undefined;
    this.compactedThisTurn = false;
    clearLegacyGlobalPlan();
    this.refreshContextUsage();
    this.sessionManager.saveAsLast();
  }

  loadSession(sessionId: string): void {
    if (this.running) return;
    this.sessionManager = new SessionManager(sessionId);
    this.messages = this.sessionManager.getMessages();
    this.lastStreamUsage = undefined;
    this.compactedThisTurn = false;
    this.refreshContextUsage();
    this.sessionManager.saveAsLast();
  }

  private async generateSessionTitle(firstMessage: string): Promise<void> {
    const quick = fallbackTitle(firstMessage);
    this.sessionManager.setTitle(quick);
    this.emit("event", { type: "session_title", title: quick } satisfies SessionEvent);

    const aiTitle = await generateSessionTitle(this.model, this.settings, firstMessage);
    if (aiTitle !== quick) {
      this.sessionManager.setTitle(aiTitle);
      this.emit("event", { type: "session_title", title: aiTitle } satisfies SessionEvent);
    }
  }

  getAvailableModels(): Model[] {
    return getAvailableModels(this.settings);
  }

  static resolveInitialModel(settings: Settings, modelRef?: string): Model | undefined {
    if (modelRef) {
      const slash = modelRef.indexOf("/");
      if (slash > 0) {
        const provider = modelRef.slice(0, slash);
        const id = modelRef.slice(slash + 1);
        return findModel(provider as Model["provider"], id);
      }
    }
    const available = getAvailableModels(settings);
    const fromSettings = findModel(settings.defaultProvider, settings.defaultModel);
    if (fromSettings && available.some((m) => m.provider === fromSettings.provider && m.id === fromSettings.id)) {
      return fromSettings;
    }
    return available[0] ?? getDefaultModelForProvider(settings.defaultProvider);
  }
}
