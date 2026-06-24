import { describe, expect, it } from "vitest";
import { executeMemory } from "../../src/agent/tools/memory.js";

describe("memory tool", () => {
  it("stores and recalls facts", async () => {
    await executeMemory({ action: "store", key: "project", value: "agent-dev" });
    const result = await executeMemory({ action: "recall", key: "project" });
    expect(result).toContain("agent-dev");
  });

  it("lists keys", async () => {
    await executeMemory({ action: "store", key: "a", value: "1" });
    const list = await executeMemory({ action: "list" });
    expect(list).toContain("a");
  });
});
