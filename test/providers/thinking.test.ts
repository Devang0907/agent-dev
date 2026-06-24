import { describe, expect, it } from "vitest";
import {
  anthropicThinkingBudget,
  geminiThinkingBudget,
  openAiReasoningEffort,
  supportsAnthropicThinking,
  supportsGeminiThinking,
  supportsOpenAiReasoning,
  isThinkingStreamBlock,
} from "../../src/providers/thinking.js";

describe("thinking helpers", () => {
  it("maps thinking levels to budgets", () => {
    expect(anthropicThinkingBudget("off")).toBeNull();
    expect(anthropicThinkingBudget("low")).toBe(4096);
    expect(geminiThinkingBudget("high")).toBe(24576);
  });

  it("maps OpenAI reasoning effort", () => {
    expect(openAiReasoningEffort("off")).toBeNull();
    expect(openAiReasoningEffort("minimal")).toBe("low");
    expect(openAiReasoningEffort("high")).toBe("high");
  });

  it("detects model support", () => {
    expect(supportsAnthropicThinking("claude-sonnet-4-6")).toBe(true);
    expect(supportsAnthropicThinking("gpt-4o")).toBe(false);
    expect(supportsOpenAiReasoning("o4-mini")).toBe(true);
    expect(supportsOpenAiReasoning("gpt-4o")).toBe(false);
    expect(supportsGeminiThinking("gemini-2.5-flash")).toBe(true);
    expect(supportsGeminiThinking("gemini-2.0-flash")).toBe(false);
  });

  it("identifies thinking stream blocks", () => {
    expect(isThinkingStreamBlock("thinking_delta")).toBe(true);
    expect(isThinkingStreamBlock("text_delta")).toBe(false);
  });
});
