import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, SETTINGS_PATH } from "./paths.js";
import type { ProviderId } from "../providers/types.js";
import type { ThinkingLevel } from "../providers/types.js";
import type { AgentMode } from "../agent/mode.js";
import { parseAgentMode } from "../agent/mode.js";
import { resolveFreeModelId } from "../providers/openrouter-free.js";

export type OrchestratorMode = "off" | "boss";

export interface SkillsSettings {
  enabled?: string[];
  disabled?: string[];
  paths?: string[];
}

export interface TelegramSettings {
  botToken?: string;
  allowedUserIds?: number[];
  workdir?: string;
}

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  agentMode?: AgentMode;
  orchestratorMode?: OrchestratorMode;
  apiKeys?: Partial<Record<ProviderId, string>>;
  skills?: SkillsSettings;
  telegram?: TelegramSettings;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  thinkingLevel: "off",
  agentMode: "build",
  orchestratorMode: "off",
};

export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Settings> & { theme?: string };
    const provider = parsed.defaultProvider ?? DEFAULT_SETTINGS.defaultProvider;
    let defaultModel = parsed.defaultModel ?? DEFAULT_SETTINGS.defaultModel;
    let migrated = false;
    if (provider === "free") {
      const resolved = resolveFreeModelId(defaultModel);
      if (resolved !== defaultModel) {
        defaultModel = resolved;
        migrated = true;
      }
    }
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      defaultProvider: provider,
      defaultModel,
      thinkingLevel: parsed.thinkingLevel ?? DEFAULT_SETTINGS.thinkingLevel,
      agentMode: parseAgentMode(parsed.agentMode ?? DEFAULT_SETTINGS.agentMode),
      orchestratorMode: parseOrchestratorMode(parsed.orchestratorMode ?? DEFAULT_SETTINGS.orchestratorMode),
      apiKeys: parsed.apiKeys,
      skills: parsed.skills,
      telegram: parsed.telegram,
    };
    if (migrated) saveSettings(settings);
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function setDefaultModel(settings: Settings, provider: ProviderId, modelId: string): Settings {
  const updated = { ...settings, defaultProvider: provider, defaultModel: modelId };
  saveSettings(updated);
  return updated;
}

export function setAgentMode(settings: Settings, agentMode: AgentMode): Settings {
  const updated = { ...settings, agentMode };
  saveSettings(updated);
  return updated;
}

export function parseOrchestratorMode(value: string | undefined): OrchestratorMode {
  return value === "boss" ? "boss" : "off";
}

export function setOrchestratorMode(settings: Settings, orchestratorMode: OrchestratorMode): Settings {
  const updated = { ...settings, orchestratorMode };
  saveSettings(updated);
  return updated;
}
