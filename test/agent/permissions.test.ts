import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchPermissionPattern,
  resolvePermissionForCategory,
  resolveToolPermission,
  loadMergedPermissionRules,
} from "../../src/agent/permissions.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("matchPermissionPattern", () => {
  it("matches exact and wildcard suffix", () => {
    expect(matchPermissionPattern("npm test", "npm test")).toBe(true);
    expect(matchPermissionPattern("npm test *", "npm test --watch")).toBe(true);
    expect(matchPermissionPattern("npm test *", "npm test")).toBe(true);
    expect(matchPermissionPattern("*", "anything")).toBe(true);
    expect(matchPermissionPattern("rm *", "rm -rf /")).toBe(true);
    expect(matchPermissionPattern("rm *", "npm test")).toBe(false);
  });
});

describe("resolvePermissionForCategory", () => {
  it("last matching rule wins", () => {
    const entries: Array<[string, "ask" | "allow" | "deny"]> = [
      ["*", "ask"],
      ["npm test", "allow"],
      ["npm test *", "deny"],
    ];
    expect(resolvePermissionForCategory(entries, "npm test --watch", "ask")).toBe("deny");
    expect(resolvePermissionForCategory(entries, "npm test", "ask")).toBe("deny");
    expect(resolvePermissionForCategory(entries, "ls", "ask")).toBe("ask");
  });
});

describe("resolveToolPermission", () => {
  it("allows read-only git and SELECT queries", () => {
    const settings = sampleSettings();
    const ws = createTmpWorkspace();
    expect(resolveToolPermission("git", { action: "status" }, ws.path, settings)).toBe("allow");
    expect(resolveToolPermission("database", { query: "SELECT 1" }, ws.path, settings)).toBe("allow");
    ws.cleanup();
  });

  it("merges global and project rules with project winning", () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, ".agent-dev"), { recursive: true });
    writeFileSync(
      join(ws.path, ".agent-dev", "permissions.json"),
      JSON.stringify({ bash: { "npm test": "allow", "rm *": "deny" } }),
      "utf8",
    );
    const settings = sampleSettings({
      permissions: { bash: { "*": "ask", "npm test": "deny" } },
    });
    const merged = loadMergedPermissionRules(ws.path, settings);
    expect(merged.bash).toContainEqual(["npm test", "allow"]);
    expect(merged.bash).toContainEqual(["npm test", "deny"]);
    expect(resolveToolPermission("bash", { command: "npm test" }, ws.path, settings)).toBe("allow");
    expect(resolveToolPermission("bash", { command: "rm -rf tmp" }, ws.path, settings)).toBe("deny");
    ws.cleanup();
  });

  it("defaults gated tools to ask without rules", () => {
    const ws = createTmpWorkspace();
    const settings = sampleSettings();
    expect(resolveToolPermission("bash", { command: "echo hi" }, ws.path, settings)).toBe("ask");
    expect(resolveToolPermission("git", { action: "commit" }, ws.path, settings)).toBe("ask");
    ws.cleanup();
  });
});
