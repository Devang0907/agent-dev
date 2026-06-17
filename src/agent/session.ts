import { EventEmitter } from "node:events";
import type { ChatMessage, Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { findModel } from "../config/models.js";
import { setDefaultModel, saveSettings } from "../config/settings.js";
import { getAvailableModels, getDefaultModelForProvider } from "../providers/registry.js";
import { runAgentLoop, type AgentEvent, type PermissionRequest } from "./loop.js";
import { SessionManager } from "../session/manager.js";

export type SessionEvent =
  | AgentEvent
  | { type: "user_message"; content: string }
  | { type: "model_changed"; model: Model }
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
    this.running = true;

    const userMsg: ChatMessage = { role: "user", content };
    this.messages.push(userMsg);
    this.sessionManager.appendMessage(userMsg);
    this.emit("event", { type: "user_message", content } satisfies SessionEvent);

    this.abortController = new AbortController();

    try {
      const newMessages = await runAgentLoop({
        model: this.model,
        messages: [...this.messages],
        settings: this.settings,
        workdir: this.workdir,
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
      this.running = false;
      this.abortController = undefined;
      this.sessionManager.saveAsLast();
    }
  }

  newSession(): void {
    this.messages = [];
    this.sessionManager.clear();
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
