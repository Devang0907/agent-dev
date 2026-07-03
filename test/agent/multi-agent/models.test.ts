import { describe, expect, it } from "vitest";
import {
  resolveAgentModel,
  isSmallModel,
  formatModelCatalog,
} from "../../../src/agent/multi-agent/models.js";
import type { Settings } from "../../../src/config/settings.js";
import type { Model } from "../../../src/providers/types.js";

const BOSS_MODEL: Model = {
  provider: "free",
  id: "boss/fallback-model",
  name: "Boss Fallback",
  contextWindow: 32_000,
};

function settingsWith(apiKeys: Settings["apiKeys"]): Settings {
  return {
    defaultProvider: "openai",
    defaultModel: "gpt-4o",
    thinkingLevel: "off",
    apiKeys,
  };
}

describe("isSmallModel", () => {
  it("classifies mini/flash/8b models as small", () => {
    expect(isSmallModel({ provider: "openai", id: "gpt-4o-mini", name: "GPT-4o Mini" })).toBe(true);
    expect(isSmallModel({ provider: "gemini", id: "gemini-2.5-flash", name: "Gemini Flash" })).toBe(true);
    expect(isSmallModel({ provider: "groq", id: "llama-3.1-8b-instant", name: "Llama 8B" })).toBe(true);
  });

  it("classifies large models as large", () => {
    expect(isSmallModel({ provider: "openai", id: "gpt-4o", name: "GPT-4o" })).toBe(false);
    expect(isSmallModel({ provider: "gemini", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" })).toBe(false);
  });
});

describe("resolveAgentModel", () => {
  it("uses a requested model when its provider is connected", () => {
    const settings = settingsWith({ openai: "sk-test" });
    const result = resolveAgentModel("openai/gpt-4.1", "medium", settings, BOSS_MODEL);
    expect(result.model.id).toBe("gpt-4.1");
    expect(result.warning).toBeUndefined();
  });

  it("falls back with a warning when the requested provider is not connected", () => {
    const settings = settingsWith({ openai: "sk-test" });
    const result = resolveAgentModel(
      "anthropic/claude-sonnet-4-6",
      "medium",
      settings,
      BOSS_MODEL,
    );
    expect(result.model.provider).toBe("openai");
    expect(result.warning).toMatch(/not available/);
  });

  it("falls back with a warning for unknown model refs", () => {
    const settings = settingsWith({ openai: "sk-test" });
    const result = resolveAgentModel("not-a-model", "low", settings, BOSS_MODEL);
    expect(result.warning).toMatch(/not available/);
  });

  it("selects a small model for low effort by default", () => {
    const settings = settingsWith({ openai: "sk-test" });
    const result = resolveAgentModel(undefined, "low", settings, BOSS_MODEL);
    expect(isSmallModel(result.model)).toBe(true);
  });

  it("selects a large model for high effort by default", () => {
    const settings = settingsWith({ openai: "sk-test" });
    const result = resolveAgentModel(undefined, "high", settings, BOSS_MODEL);
    expect(isSmallModel(result.model)).toBe(false);
  });

  it("falls back to the boss model when no provider is connected", () => {
    const settings = settingsWith(undefined);
    const result = resolveAgentModel(undefined, "medium", settings, BOSS_MODEL);
    expect(result.model).toBe(BOSS_MODEL);
  });
});

describe("formatModelCatalog", () => {
  it("lists only connected providers", () => {
    const catalog = formatModelCatalog(settingsWith({ openai: "sk-test" }));
    expect(catalog).toContain("openai/gpt-4o");
    expect(catalog).not.toContain("anthropic/");
  });

  it("reports when nothing is connected", () => {
    expect(formatModelCatalog(settingsWith(undefined))).toMatch(/no models connected/);
  });
});
