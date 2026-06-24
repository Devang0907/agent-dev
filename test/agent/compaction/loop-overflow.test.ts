import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../../../src/agent/loop.js";
import { sampleSettings } from "../../fixtures/sample-settings.js";

describe("runAgentLoop overflow recovery", () => {
  it("retries after onContextOverflow when context error occurs", async () => {
    let attempts = 0;
    const events: unknown[] = [];

    await runAgentLoop({
      model: { provider: "free", id: "test", name: "Test" },
      messages: [{ role: "user", content: "hi" }],
      settings: sampleSettings(),
      workdir: process.cwd(),
      onEvent: (e) => events.push(e),
      onContextOverflow: async () => {
        return true;
      },
      streamChatOverride: async function* () {
        attempts++;
        if (attempts === 1) {
          yield { type: "error", message: "context length exceeded" };
          return;
        }
        yield { type: "text_delta", delta: "recovered" };
        yield { type: "done" };
      },
    });

    expect(attempts).toBe(2);
    expect(events.some((e) => (e as { type: string }).type === "turn_end")).toBe(true);
  });

  it("emits context_usage when stream reports usage", async () => {
    const events: unknown[] = [];
    await runAgentLoop({
      model: { provider: "free", id: "test", name: "Test" },
      messages: [{ role: "user", content: "hi" }],
      settings: sampleSettings(),
      workdir: process.cwd(),
      onEvent: (e) => events.push(e),
      streamChatOverride: async function* () {
        yield { type: "text_delta", delta: "ok" };
        yield { type: "done", usage: { inputTokens: 100, outputTokens: 20 } };
      },
    });

    const usage = events.find((e) => (e as { type: string }).type === "context_usage");
    expect(usage).toMatchObject({ type: "context_usage", inputTokens: 100, outputTokens: 20 });
  });
});
