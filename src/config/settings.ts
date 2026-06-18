import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, SETTINGS_PATH } from "./paths.js";
import type { ProviderId } from "../providers/types.js";
import type { ThinkingLevel } from "../providers/types.js";

export interface SkillsSettings {
  enabled?: string[];
  disabled?: string[];
  paths?: string[];
}

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  apiKeys?: Partial<Record<ProviderId, string>>;
  skills?: SkillsSettings;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  thinkingLevel: "off",
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
