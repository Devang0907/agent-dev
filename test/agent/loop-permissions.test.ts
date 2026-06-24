import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runLoopWithScript } from "../lib/run-loop.js";
import { toolCallRound, textThenDone } from "../lib/mock-stream.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("loop permission presets", () => {
  it("auto-allows bash when policy matches", async () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, ".agent-dev"), { recursive: true });
    writeFileSync(
      join(ws.path, ".agent-dev", "permissions.json"),
      JSON.stringify({ bash: { "npm test": "allow" } }),
      "utf8",
    );

    let prompted = false;
    const { events } = await runLoopWithScript({
      workdir: ws.path,
      settings: sampleSettings(),
      scripts: [toolCallRound("bash", { command: "npm test" }), textThenDone("done")],
      onPermission: () => {
        prompted = true;
        return false;
      },
    });

    expect(prompted).toBe(false);
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).not.toMatch(/denied/i);
    ws.cleanup();
  });

  it("auto-denies bash when policy matches", async () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, ".agent-dev"), { recursive: true });
    writeFileSync(
      join(ws.path, ".agent-dev", "permissions.json"),
      JSON.stringify({ bash: { "rm *": "deny" } }),
      "utf8",
    );

    let prompted = false;
    const { events } = await runLoopWithScript({
      workdir: ws.path,
      settings: sampleSettings(),
      script: toolCallRound("bash", { command: "rm -rf /tmp/foo" }),
      onPermission: () => {
        prompted = true;
        return true;
      },
    });

    expect(prompted).toBe(false);
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).toMatch(/denied by permission policy/i);
    ws.cleanup();
  });

  it("still prompts when no matching allow/deny rule", async () => {
    let prompted = false;
    const { events } = await runLoopWithScript({
      script: toolCallRound("bash", { command: "echo hi" }),
      settings: sampleSettings(),
      onPermission: () => {
        prompted = true;
        return false;
      },
    });

    expect(prompted).toBe(true);
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).toMatch(/denied by user/i);
  });

  it("denies verify when permission rejected", async () => {
    const { events } = await runLoopWithScript({
      script: toolCallRound("verify", { command: "npm test" }),
      onPermission: () => false,
    });
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).toMatch(/denied/i);
  });

  it("auto-allows verify when bash policy matches", async () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, ".agent-dev"), { recursive: true });
    writeFileSync(
      join(ws.path, ".agent-dev", "permissions.json"),
      JSON.stringify({ bash: { "npm test": "allow" } }),
      "utf8",
    );

    let prompted = false;
    const { events } = await runLoopWithScript({
      workdir: ws.path,
      settings: sampleSettings(),
      scripts: [toolCallRound("verify", { command: "npm test" }), textThenDone("done")],
      onPermission: () => {
        prompted = true;
        return false;
      },
    });

    expect(prompted).toBe(false);
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).not.toMatch(/denied/i);
    ws.cleanup();
  });
});
