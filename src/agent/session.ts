import { EventEmitter } from "node:events";
import type { ChatMessage, Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { findModel } from "../config/models.js";
import { setDefaultModel, saveSettings, setAgentMode } from "../config/settings.js";
import { getAvailableModels, getDefaultModelForProvider } from "../providers/registry.js";
import { runAgentLoop, type AgentEvent, type PermissionRequest } from "./loop.js";
import { resolveSkillCommand } from "./skills.js";
import type { AgentMode } from "./mode.js";
import { buildSwitchReminder } from "./mode.js";
import { SessionManager } from "../session/manager.js";
import { generateSessionTitle, fallbackTitle } from "../session/title.js";

export type SessionEvent =
  | AgentEvent
  | { type: "user_message"; content: string }
  | { type: "model_changed"; model: Model }
  | { type: "agent_mode_changed"; mode: AgentMode }
  | { type: "session_title"; title: string }
  | { type: "permission_request"; request: PermissionRequest };

export class AgentSession extends EventEmitter {
  private messages: ChatMessage[] = [];
  private model: Model;
  private settings: Settings;
  private workdir: string;
  private sessionManager: SessionManager;
  private abortController?: AbortController;
  private running = false;
  private pendingPermission?: (approved: boolean) => void;
  private lastLoopMode: AgentMode = "build";

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
  }

  getAgentMode(): AgentMode {
    return this.settings.agentMode ?? "build";
  }

  setAgentMode(mode: AgentMode): void {
    if (this.settings.agentMode === mode) return;
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
    this.emit("event", { type: "model_changed", model } satisfies SessionEvent);
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(settings);
  }

  abort(): void {
    this.abortController?.abort();
    this.resolvePermission(false);
  }

  respondToPermission(approved: boolean): void {
    this.resolvePermission(approved);
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

      try {
        const loopMessages = [...this.messages.slice(0, -1), { role: "user" as const, content: agentContent }];
        const newMessages = await runAgentLoop({
          model: this.model,
          messages: loopMessages,
          settings: this.settings,
          workdir: this.workdir,
          agentMode: this.getAgentMode(),
          modeSwitchNote: this.modeSwitchNote(),
          signal: this.abortController.signal,
          onEvent: (event) => this.emit("event", event),
          onPermissionRequest: (request) => this.requestCommandPermission(request),
        });

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

    try {
      const newMessages = await runAgentLoop({
        model: this.model,
        messages: [...this.messages],
        settings: this.settings,
        workdir: this.workdir,
        agentMode: this.getAgentMode(),
        modeSwitchNote: this.modeSwitchNote(),
        signal: this.abortController.signal,
        onEvent: (event) => this.emit("event", event),
        onPermissionRequest: (request) => this.requestCommandPermission(request),
      });

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
    this.messages = [];
    this.sessionManager = new SessionManager(undefined, this.workdir);
    this.sessionManager.saveAsLast();
  }

  loadSession(sessionId: string): void {
    if (this.running) return;
    this.sessionManager = new SessionManager(sessionId);
    this.messages = this.sessionManager.getMessages();
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
