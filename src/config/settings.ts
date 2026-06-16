import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, SETTINGS_PATH } from "./paths.js";
import type { ProviderId } from "../providers/types.js";
import type { ThinkingLevel, Theme } from "../providers/types.js";

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  theme: Theme;
  apiKeys?: Partial<Record<ProviderId, string>>;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  thinkingLevel: "off",
  theme: "dark",
};

export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
