import type { ChatMessage, Model } from "../../providers/types.js";
import type { CompactionSettings } from "../../config/settings.js";
import { DEFAULT_COMPACTION_SETTINGS } from "../../config/settings.js";
import { findModel } from "../../config/models.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ContextUsageEstimate {
  tokens: number;
  usageTokens: number;
  trailingTokens: number;
  lastUsageIndex: number | null;
}

export function estimateMessageTokens(message: ChatMessage): number {
  let chars = message.content.length;

  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      chars += tc.name.length + tc.arguments.length + (tc.id?.length ?? 0);
    }
  }
  if (message.name) chars += message.name.length;
  if (message.toolCallId) chars += message.toolCallId.length;

  return Math.ceil(chars / 4);
}

export function estimateContextTokens(
  messages: ChatMessage[],
  lastUsage?: TokenUsage,
): ContextUsageEstimate {
  let lastAssistantIndex: number | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant" && (msg.content || msg.toolCalls?.length)) {
      lastAssistantIndex = i;
      break;
    }
  }

  if (!lastUsage?.inputTokens) {
    let estimated = 0;
    for (const message of messages) {
      estimated += estimateMessageTokens(message);
    }
    return {
      tokens: estimated,
      usageTokens: 0,
      trailingTokens: estimated,
      lastUsageIndex: null,
    };
  }

  const usageTokens = lastUsage.inputTokens + (lastUsage.outputTokens ?? 0);
  let trailingTokens = 0;
  if (lastAssistantIndex !== null) {
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      trailingTokens += estimateMessageTokens(messages[i]!);
    }
  }

  return {
    tokens: usageTokens + trailingTokens,
    usageTokens,
    trailingTokens,
    lastUsageIndex: lastAssistantIndex,
  };
}

export function getContextWindow(model: Model): number {
  if (model.contextWindow) return model.contextWindow;
  const found = findModel(model.provider, model.id);
  return found?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings,
): boolean {
  const enabled = settings.enabled ?? DEFAULT_COMPACTION_SETTINGS.enabled;
  if (!enabled) return false;
  const reserve = settings.reserveTokens ?? DEFAULT_COMPACTION_SETTINGS.reserveTokens!;
  return contextTokens > contextWindow - reserve;
}

export function isContextOverflowError(message: string): boolean {
  return /context.*(length|limit|overflow|too large|exceed)|maximum context|token limit|too many tokens|request too large/i.test(
    message,
  );
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
