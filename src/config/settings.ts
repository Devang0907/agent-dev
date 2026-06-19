import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, SETTINGS_PATH } from "./paths.js";
import type { ProviderId } from "../providers/types.js";
import type { ThinkingLevel } from "../providers/types.js";
import type { AgentMode } from "../agent/mode.js";
import { parseAgentMode } from "../agent/mode.js";

export interface SkillsSettings {
  enabled?: string[];
  disabled?: string[];
  paths?: string[];
}

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  agentMode?: AgentMode;
  apiKeys?: Partial<Record<ProviderId, string>>;
  skills?: SkillsSettings;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  thinkingLevel: "off",
  agentMode: "build",
};

export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Settings> & { theme?: string };
    return {
      ...DEFAULT_SETTINGS,
      defaultProvider: parsed.defaultProvider ?? DEFAULT_SETTINGS.defaultProvider,
      defaultModel: parsed.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
      thinkingLevel: parsed.thinkingLevel ?? DEFAULT_SETTINGS.thinkingLevel,
      agentMode: parseAgentMode(parsed.agentMode ?? DEFAULT_SETTINGS.agentMode),
      apiKeys: parsed.apiKeys,
      skills: parsed.skills,
    };
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
