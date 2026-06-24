import type { ThinkingLevel } from "./types.js";

const ANTHROPIC_THINKING_BUDGET: Record<Exclude<ThinkingLevel, "off">, number> = {
  minimal: 1024,
  low: 4096,
  medium: 10_000,
  high: 32_000,
};

const GEMINI_THINKING_BUDGET: Record<Exclude<ThinkingLevel, "off">, number> = {
  minimal: 1024,
  low: 4096,
  medium: 10_000,
  high: 24_576,
};

const OPENAI_REASONING_EFFORT: Record<
  Exclude<ThinkingLevel, "off" | "minimal">,
  "low" | "medium" | "high"
> = {
  low: "low",
  medium: "medium",
  high: "high",
};

export function anthropicThinkingBudget(level: ThinkingLevel): number | null {
  if (level === "off") return null;
  return ANTHROPIC_THINKING_BUDGET[level];
}

export function supportsAnthropicThinking(modelId: string): boolean {
  return /claude-(sonnet|opus|haiku)-4/i.test(modelId) || /claude-sonnet-4|claude-opus-4/i.test(modelId);
}

export function supportsOpenAiReasoning(modelId: string): boolean {
  return /^o[34]-/i.test(modelId) || modelId.startsWith("o3-") || modelId.startsWith("o4-");
}

export function openAiReasoningEffort(
  level: ThinkingLevel,
): "low" | "medium" | "high" | null {
  if (level === "off") return null;
  if (level === "minimal") return "low";
  return OPENAI_REASONING_EFFORT[level];
}

export function supportsGeminiThinking(modelId: string): boolean {
  return /gemini-2\.5/i.test(modelId);
}

export function geminiThinkingBudget(level: ThinkingLevel): number | null {
  if (level === "off") return null;
  return GEMINI_THINKING_BUDGET[level];
}

export function isThinkingStreamBlock(deltaType: string): boolean {
  return deltaType === "thinking_delta" || deltaType === "redacted_thinking_delta";
}
