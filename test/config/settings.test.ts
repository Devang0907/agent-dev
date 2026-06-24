import { describe, expect, it } from "vitest";
import { loadSettings, saveSettings, setAgentMode } from "../../src/config/settings.js";

describe("settings", () => {
  it("returns defaults when missing file", () => {
    const s = loadSettings();
    expect(s.defaultProvider).toBe("free");
    expect(s.agentMode).toBe("build");
  });

  it("round-trips save and load", () => {
    const updated = setAgentMode(loadSettings(), "plan");
    expect(updated.agentMode).toBe("plan");
    const loaded = loadSettings();
    expect(loaded.agentMode).toBe("plan");
    saveSettings({ ...loaded, agentMode: "build" });
  });
});
