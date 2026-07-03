import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { getConfigDir, getSettingsPath } from "./paths.js";
import type { ProviderId } from "../providers/types.js";
import type { ThinkingLevel } from "../providers/types.js";
import type { AgentMode } from "../agent/mode.js";
import { parseAgentMode } from "../agent/mode.js";
import { resolveFreeModelId } from "../providers/openrouter-free.js";

export type OrchestratorMode = "off" | "boss" | "multi";

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

export interface BrowserSettings {
  headless?: boolean;
  actionTimeoutMs?: number;
  profileDir?: string;
}

export interface CompactionSettings {
  enabled?: boolean;
  reserveTokens?: number;
  keepRecentTokens?: number;
  pruneToolOutputs?: boolean;
}

export interface ProjectRulesSettings {
  enabled?: boolean;
  maxChars?: number;
}

export interface MultiAgentSettings {
  /** Max worker agents running concurrently in multi mode (default 3). */
  maxParallel?: number;
}

export type PermissionAction = "allow" | "ask" | "deny";
export type PermissionRuleValue = PermissionAction | Record<string, PermissionAction>;
export type PermissionRulesConfig = Partial<
  Record<"bash" | "git" | "database" | "mcp" | "browser" | "files", PermissionRuleValue>
>;

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  agentMode?: AgentMode;
  orchestratorMode?: OrchestratorMode;
  apiKeys?: Partial<Record<ProviderId, string>>;
  skills?: SkillsSettings;
  telegram?: TelegramSettings;
  browser?: BrowserSettings;
  compaction?: CompactionSettings;
  projectRules?: ProjectRulesSettings;
  permissions?: PermissionRulesConfig;
  multiAgent?: MultiAgentSettings;
}

export const DEFAULT_MULTI_AGENT_MAX_PARALLEL = 3;

export function getMultiAgentMaxParallel(settings?: Settings): number {
  const raw = settings?.multiAgent?.maxParallel;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return DEFAULT_MULTI_AGENT_MAX_PARALLEL;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
  pruneToolOutputs: true,
};

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  thinkingLevel: "off",
  agentMode: "build",
  orchestratorMode: "off",
  compaction: { ...DEFAULT_COMPACTION_SETTINGS },
};

function parseCompactionSettings(raw?: CompactionSettings): CompactionSettings {
  const envEnabled = process.env.AGENT_COMPACTION_ENABLED;
  const envReserve = process.env.AGENT_COMPACTION_RESERVE_TOKENS;
  return {
    enabled:
      envEnabled !== undefined
        ? !/^(0|false|no)$/i.test(envEnabled)
        : (raw?.enabled ?? DEFAULT_COMPACTION_SETTINGS.enabled),
    reserveTokens:
      envReserve && Number.isFinite(Number(envReserve))
        ? Number(envReserve)
        : (raw?.reserveTokens ?? DEFAULT_COMPACTION_SETTINGS.reserveTokens),
    keepRecentTokens: raw?.keepRecentTokens ?? DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
    pruneToolOutputs: raw?.pruneToolOutputs ?? DEFAULT_COMPACTION_SETTINGS.pruneToolOutputs,
  };
}

export function getCompactionSettings(settings: Settings): CompactionSettings {
  return parseCompactionSettings(settings.compaction);
}

const DEFAULT_PROJECT_RULES_SETTINGS: ProjectRulesSettings = {
  enabled: true,
  maxChars: 32_768,
};

export function getProjectRulesSettings(settings?: Settings): ProjectRulesSettings {
  return {
    enabled:
      process.env.AGENT_NO_PROJECT_RULES === "1"
        ? false
        : (settings?.projectRules?.enabled ?? DEFAULT_PROJECT_RULES_SETTINGS.enabled),
    maxChars: settings?.projectRules?.maxChars ?? DEFAULT_PROJECT_RULES_SETTINGS.maxChars,
  };
}

export function loadSettings(): Settings {
  if (!existsSync(getSettingsPath())) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(getSettingsPath(), "utf-8");
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
      browser: parsed.browser,
      compaction: parseCompactionSettings(parsed.compaction),
      projectRules: parsed.projectRules,
      permissions: parsed.permissions,
      multiAgent: parsed.multiAgent,
    };
    if (migrated) saveSettings(settings);
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
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
  if (value === "boss") return "boss";
  if (value === "multi") return "multi";
  return "off";
}

export function setOrchestratorMode(settings: Settings, orchestratorMode: OrchestratorMode): Settings {
  const updated = { ...settings, orchestratorMode };
  saveSettings(updated);
  return updated;
}
