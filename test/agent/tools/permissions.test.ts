import { describe, expect, it } from "vitest";
import {
  checkPlanModeToolBlock,
  formatPermissionCommand,
  getToolDefinitions,
  needsToolPermission,
  resolveToolPermission,
} from "../../../src/agent/tools/index.js";
import { BOSS_TOOL_NAMES } from "../../../src/agent/orchestrator/workers.js";
import { createTmpWorkspace } from "../../fixtures/tmp-workspace.js";
import { sampleSettings } from "../../fixtures/sample-settings.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("needsToolPermission", () => {
  it.each([
    ["bash", { command: "ls" }, true],
    ["exec", { cmd: ["echo", "hi"] }, true],
    ["read", { path: "a.ts" }, false],
    ["git", { action: "status" }, false],
    ["git", { action: "commit" }, true],
    ["database", { query: "SELECT 1" }, false],
    ["database", { query: "DELETE FROM x" }, true],
    ["mcp", { action: "call_tool" }, true],
    ["mcp", { action: "list_tools" }, false],
  ] as const)("tool %s permission=%s", (name, args, expected) => {
    expect(needsToolPermission(name, args)).toBe(expected);
  });

  it("uses resolveToolPermission when workdir and settings provided", () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, ".agent-dev"), { recursive: true });
    writeFileSync(
      join(ws.path, ".agent-dev", "permissions.json"),
      JSON.stringify({ bash: { "npm test": "allow" } }),
      "utf8",
    );
    const settings = sampleSettings();
    expect(needsToolPermission("bash", { command: "npm test" }, ws.path, settings)).toBe(false);
    expect(needsToolPermission("bash", { command: "rm x" }, ws.path, settings)).toBe(true);
    expect(resolveToolPermission("bash", { command: "npm test" }, ws.path, settings)).toBe("allow");
    ws.cleanup();
  });
});

describe("formatPermissionCommand", () => {
  it("formats bash command", () => {
    expect(formatPermissionCommand("bash", { command: "npm test" })).toBe("npm test");
  });

  it("formats git action", () => {
    expect(formatPermissionCommand("git", { action: "commit", args: "-m hi" })).toContain("commit");
  });
});

describe("getToolDefinitions boss mode", () => {
  it("only exposes boss tools when allowed", () => {
    const names = getToolDefinitions("build", [...BOSS_TOOL_NAMES]).map((t) => t.name);
    expect(names.sort()).toEqual(["delegate", "plan"]);
  });
});

describe("checkPlanModeToolBlock", () => {
  const ws = createTmpWorkspace();
  it("blocks bash in plan mode", () => {
    expect(checkPlanModeToolBlock("plan", "bash", { command: "ls" }, ws.path)).toMatch(/Plan mode/);
  });
  it("allows bash in build mode", () => {
    expect(checkPlanModeToolBlock("build", "bash", { command: "ls" }, ws.path)).toBeNull();
  });
  ws.cleanup();
});
