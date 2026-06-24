import { describe, expect, it } from "vitest";
import { runLoopWithScript } from "../lib/run-loop.js";
import { toolCallRound, textThenDone } from "../lib/mock-stream.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("runAgentLoop", () => {
  it("streams text and ends turn", async () => {
    const { events } = await runLoopWithScript({
      script: textThenDone("Hello from test"),
    });
    expect(events.some((e) => e.type === "text_delta")).toBe(true);
    expect(events.some((e) => e.type === "turn_end")).toBe(true);
  });

  it("runs read tool when approved path exists", async () => {
    const ws = createTmpWorkspace({ files: { "note.txt": "content" } });
    const { events } = await runLoopWithScript({
      workdir: ws.path,
      script: toolCallRound("read", { path: "note.txt" }),
    });
    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    ws.cleanup();
  });

  it("denies bash when permission rejected", async () => {
    const { events } = await runLoopWithScript({
      script: toolCallRound("bash", { command: "echo hi" }),
      onPermission: () => false,
    });
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult && "result" in toolResult && toolResult.result).toMatch(/denied/i);
  });

  it("approves bash when permission granted", async () => {
    const { events } = await runLoopWithScript({
      scripts: [toolCallRound("bash", { command: "echo loop-test" }), textThenDone("done")],
      onPermission: () => true,
    });
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
  });

  it("blocks bash in plan mode", async () => {
    const { events } = await runLoopWithScript({
      agentMode: "plan",
      script: toolCallRound("bash", { command: "ls" }),
      onPermission: () => true,
    });
    const result = events.find((e) => e.type === "tool_result");
    expect(result && "result" in result && result.result).toMatch(/Plan mode/);
  });

  it("skips repeated identical tool calls", async () => {
    const ws = createTmpWorkspace({ files: { "a.txt": "foo" } });
    const readCall = toolCallRound("read", { path: "a.txt" });
    const { events } = await runLoopWithScript({
      workdir: ws.path,
      scripts: [readCall, readCall, readCall, textThenDone("ok")],
    });
    const skipped = events.filter(
      (e) => e.type === "tool_result" && "result" in e && String(e.result).includes("Skipped"),
    );
    expect(skipped.length).toBeGreaterThan(0);
    ws.cleanup();
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const events: unknown[] = [];
    const { runAgentLoop } = await import("../../src/agent/loop.js");
    await runAgentLoop({
      model: { provider: "free", id: "test", name: "Test" },
      messages: [{ role: "user", content: "hi" }],
      settings: (await import("../fixtures/sample-settings.js")).sampleSettings(),
      workdir: process.cwd(),
      signal: controller.signal,
      onEvent: (e) => events.push(e),
      streamChatOverride: async function* () {
        yield { type: "text_delta", delta: "x" };
        yield { type: "done" };
      },
    });
    expect(events.some((e) => (e as { type: string }).type === "turn_end")).toBe(false);
  });
});
