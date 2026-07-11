import type { Settings } from "../../src/config/settings.js";

export function sampleEvalSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    defaultProvider: "free",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    thinkingLevel: "off",
    agentMode: "build",
    orchestratorMode: "off",
    compaction: { enabled: false },
    ...overrides,
  };
}
