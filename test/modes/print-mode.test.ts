import { describe, expect, it } from "vitest";
import { resolveSkillCommand } from "../../src/agent/skills.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("print mode prerequisites", () => {
  it("skill list command resolves without LLM", () => {
    const ws = createTmpWorkspace();
    const result = resolveSkillCommand("/skill", ws.path, sampleSettings());
    expect(result.type).toBe("list");
    ws.cleanup();
  });

  it("unknown skill returns error message", () => {
    const ws = createTmpWorkspace();
    const result = resolveSkillCommand("/skill missing-skill-xyz", ws.path, sampleSettings());
    expect(result.type).toBe("error");
    ws.cleanup();
  });
});
