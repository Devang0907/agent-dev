import { describe, expect, it } from "vitest";
import {
  cycleAgentMode,
  getToolDefinitionsForMode,
  isAllowedPlanWritePath,
  isToolBlockedInPlanMode,
} from "../../src/agent/mode.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("isAllowedPlanWritePath", () => {
  it.each([
    [".agent-dev/plans/foo.md", true],
    [".agents/plans/bar.md", true],
    ["src/index.ts", false],
    ["README.md", false],
  ])("%s → %s", (path, allowed) => {
    expect(isAllowedPlanWritePath(path)).toBe(allowed);
  });
});

describe("isToolBlockedInPlanMode", () => {
  const ws = createTmpWorkspace();
  const workdir = ws.path;

  it("blocks bash", () => {
    expect(isToolBlockedInPlanMode("bash", { command: "ls" }, workdir)).toMatch(/Plan mode/);
  });

  it("blocks verify", () => {
    expect(isToolBlockedInPlanMode("verify", {}, workdir)).toMatch(/Plan mode/);
  });

  it("allows read", () => {
    expect(isToolBlockedInPlanMode("read", { path: "foo.ts" }, workdir)).toBeNull();
  });

  it("blocks git commit", () => {
    expect(isToolBlockedInPlanMode("git", { action: "commit" }, workdir)).toMatch(/Plan mode/);
  });

  it("allows plan file write", () => {
    expect(
      isToolBlockedInPlanMode("write", { path: ".agent-dev/plans/x.md", content: "x" }, workdir),
    ).toBeNull();
  });

  ws.cleanup();
});

describe("getToolDefinitionsForMode", () => {
  const all = [{ name: "read" }, { name: "bash" }, { name: "verify" }];

  it("filters plan mode tools", () => {
    const names = getToolDefinitionsForMode(all, "plan").map((t) => t.name);
    expect(names).toEqual(["read"]);
  });

  it("keeps all in build mode", () => {
    expect(getToolDefinitionsForMode(all, "build")).toHaveLength(3);
  });
});

describe("cycleAgentMode", () => {
  it("toggles build and plan", () => {
    expect(cycleAgentMode("build")).toBe("plan");
    expect(cycleAgentMode("plan")).toBe("build");
  });
});
