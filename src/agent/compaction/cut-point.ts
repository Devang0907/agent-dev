import type { SessionEntry, CompactionData } from "../../session/manager.js";
import type { ChatMessage } from "../../providers/types.js";
import { estimateMessageTokens } from "./tokens.js";

export interface CutPointResult {
  firstKeptEntryIndex: number;
  firstKeptEntryId: string;
  turnStartIndex: number;
  isSplitTurn: boolean;
  messagesToSummarize: ChatMessage[];
  turnPrefixMessages: ChatMessage[];
}

function isValidCutEntry(entry: SessionEntry): boolean {
  if (entry.type === "message") {
    const role = (entry.data as ChatMessage).role;
    return role === "user" || role === "assistant";
  }
  return false;
}

function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, startIndex: number): number {
  for (let i = entryIndex; i >= startIndex; i--) {
    const entry = entries[i];
    if (entry?.type === "message") {
      const role = (entry.data as ChatMessage).role;
      if (role === "user") return i;
    }
  }
  return -1;
}

function messageEntriesBetween(
  entries: SessionEntry[],
  startIndex: number,
  endIndex: number,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const entry = entries[i];
    if (entry?.type === "message") {
      out.push(entry.data as ChatMessage);
    }
  }
  return out;
}

/**
 * Find cut point keeping approximately keepRecentTokens of recent messages.
 * Never cuts at tool results — only user or assistant message boundaries.
 */
export function findCutPoint(
  entries: SessionEntry[],
  keepRecentTokens: number,
  summarizeStartIndex = 0,
): CutPointResult | null {
  const messageIndices: number[] = [];
  for (let i = summarizeStartIndex; i < entries.length; i++) {
    if (isValidCutEntry(entries[i]!)) {
      messageIndices.push(i);
    }
  }

  if (messageIndices.length === 0) return null;

  let accumulatedTokens = 0;
  let cutIndex = messageIndices[0]!;

  for (let i = entries.length - 1; i >= summarizeStartIndex; i--) {
    const entry = entries[i];
    if (entry?.type !== "message") continue;

    accumulatedTokens += estimateMessageTokens(entry.data as ChatMessage);
    if (accumulatedTokens >= keepRecentTokens) {
      for (const idx of messageIndices) {
        if (idx >= i) {
          cutIndex = idx;
          break;
        }
      }
      break;
    }
  }

  if (cutIndex <= summarizeStartIndex) {
    return null;
  }

  const cutEntry = entries[cutIndex]!;
  const isUserMessage =
    cutEntry.type === "message" && (cutEntry.data as ChatMessage).role === "user";
  const turnStartIndex = isUserMessage ? -1 : findTurnStartIndex(entries, cutIndex, summarizeStartIndex);
  const isSplitTurn = !isUserMessage && turnStartIndex >= 0;

  let summarizeEndIndex = cutIndex;
  let turnPrefixMessages: ChatMessage[] = [];

  if (isSplitTurn && turnStartIndex >= 0) {
    summarizeEndIndex = turnStartIndex;
    turnPrefixMessages = messageEntriesBetween(entries, turnStartIndex, cutIndex);
  }

  const messagesToSummarize = messageEntriesBetween(entries, summarizeStartIndex, summarizeEndIndex);
  if (messagesToSummarize.length === 0 && turnPrefixMessages.length === 0) {
    return null;
  }

  return {
    firstKeptEntryIndex: cutIndex,
    firstKeptEntryId: cutEntry.id,
    turnStartIndex,
    isSplitTurn,
    messagesToSummarize,
    turnPrefixMessages,
  };
}

export function getSummarizeStartIndex(entries: SessionEntry[]): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "compaction") {
      const keptId = (entry.data as CompactionData).firstKeptEntryId;
      const keptIndex = entries.findIndex((e) => e.id === keptId);
      return keptIndex >= 0 ? keptIndex : 0;
    }
  }
  return 0;
}
