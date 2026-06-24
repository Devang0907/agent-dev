import { describe, expect, it } from "vitest";
import {
  estimateMessageTokens,
  estimateContextTokens,
  shouldCompact,
  isContextOverflowError,
  formatTokenCount,
  getContextWindow,
} from "../../../src/agent/compaction/tokens.js";
import { DEFAULT_COMPACTION_SETTINGS } from "../../../src/config/settings.js";

describe("estimateMessageTokens", () => {
  it("uses chars/4 heuristic", () => {
    const tokens = estimateMessageTokens({ role: "user", content: "a".repeat(400) });
    expect(tokens).toBe(100);
  });

  it("includes tool call arguments", () => {
    const tokens = estimateMessageTokens({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "1", name: "read", arguments: '{"path":"x.ts"}' }],
    });
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("estimateContextTokens", () => {
  it("sums all messages when no usage", () => {
    const messages = [
      { role: "user" as const, content: "a".repeat(40) },
      { role: "assistant" as const, content: "b".repeat(40) },
    ];
    const est = estimateContextTokens(messages);
    expect(est.tokens).toBe(20);
    expect(est.lastUsageIndex).toBeNull();
  });

  it("adds trailing estimate after last usage", () => {
    const messages = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
      { role: "user" as const, content: "a".repeat(40) },
    ];
    const est = estimateContextTokens(messages, { inputTokens: 1000, outputTokens: 50 });
    expect(est.usageTokens).toBe(1050);
    expect(est.trailingTokens).toBeGreaterThan(0);
    expect(est.tokens).toBe(est.usageTokens + est.trailingTokens);
  });
});

describe("shouldCompact", () => {
  it("triggers when over window minus reserve", () => {
    expect(shouldCompact(120_000, 128_000, DEFAULT_COMPACTION_SETTINGS)).toBe(true);
    expect(shouldCompact(50_000, 128_000, DEFAULT_COMPACTION_SETTINGS)).toBe(false);
  });

  it("respects enabled=false", () => {
    expect(shouldCompact(200_000, 128_000, { ...DEFAULT_COMPACTION_SETTINGS, enabled: false })).toBe(
      false,
    );
  });
});

describe("isContextOverflowError", () => {
  it.each([
    "context length exceeded",
    "maximum context limit reached",
    "request too large for model",
  ])("detects %s", (msg) => {
    expect(isContextOverflowError(msg)).toBe(true);
  });
});

describe("formatTokenCount", () => {
  it("formats thousands", () => {
    expect(formatTokenCount(42_000)).toBe("42k");
  });
});

describe("getContextWindow", () => {
  it("uses model contextWindow when set", () => {
    expect(
      getContextWindow({ provider: "openai", id: "gpt-4o", name: "GPT-4o", contextWindow: 128_000 }),
    ).toBe(128_000);
  });
});
