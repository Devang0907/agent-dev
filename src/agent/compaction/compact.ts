import type { ChatMessage } from "../../providers/types.js";
import type { Model } from "../../providers/types.js";
import type { Settings } from "../../config/settings.js";
import type { CompactionReason, SessionEntry, SessionManager, CompactionData } from "../../session/manager.js";
import { getCompactionSettings } from "../../config/settings.js";
import { findCutPoint, getSummarizeStartIndex } from "./cut-point.js";
import { estimateContextTokens } from "./tokens.js";
import { summarizeConversation } from "./summarize.js";

export interface FileOperations {
  readFiles: Set<string>;
  modifiedFiles: Set<string>;
}

export interface CompactionPreparation {
  cut: NonNullable<ReturnType<typeof findCutPoint>>;
  tokensBefore: number;
  previousSummary?: string;
  fileOps: FileOperations;
}

export interface CompactionResult {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  tokensAfter: number;
  reason: CompactionReason;
  readFiles: string[];
  modifiedFiles: string[];
}

function createFileOps(): FileOperations {
  return { readFiles: new Set(), modifiedFiles: new Set() };
}

function extractPathFromArgs(args: Record<string, unknown>): string | undefined {
  const path = args.path ?? args.file ?? args.database;
  return typeof path === "string" && path.trim() ? path.trim() : undefined;
}

function extractFileOpsFromMessage(message: ChatMessage, ops: FileOperations): void {
  if (message.role !== "assistant" || !message.toolCalls) return;
  for (const tc of message.toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments || "{}");
    } catch {
      continue;
    }
    const path = extractPathFromArgs(args);
    if (!path) continue;
    if (tc.name === "read" || tc.name === "grep" || tc.name === "docs") {
      ops.readFiles.add(path);
    } else if (tc.name === "write" || tc.name === "edit" || tc.name === "diff") {
      ops.modifiedFiles.add(path);
    }
  }
}

function extractFileOps(messages: ChatMessage[], previous?: FileOperations): FileOperations {
  const ops = createFileOps();
  if (previous) {
    for (const f of previous.readFiles) ops.readFiles.add(f);
    for (const f of previous.modifiedFiles) ops.modifiedFiles.add(f);
  }
  for (const msg of messages) {
    extractFileOpsFromMessage(msg, ops);
  }
  return ops;
}

function fileOpsFromCompactionEntry(entry: SessionEntry | undefined): FileOperations | undefined {
  if (!entry || entry.type !== "compaction") return undefined;
  const data = entry.data as CompactionData;
  if (!data.readFiles && !data.modifiedFiles) return undefined;
  return {
    readFiles: new Set(data.readFiles ?? []),
    modifiedFiles: new Set(data.modifiedFiles ?? []),
  };
}

export function prepareCompaction(
  sessionManager: SessionManager,
  settings: Settings,
): CompactionPreparation | null {
  const compactionSettings = getCompactionSettings(settings);
  const entries = sessionManager.getEntries();
  const summarizeStart = getSummarizeStartIndex(entries);
  const keepRecent = compactionSettings.keepRecentTokens ?? 20_000;

  const cut = findCutPoint(entries, keepRecent, summarizeStart);
  if (!cut) return null;

  const contextMessages = sessionManager.getContextMessages();
  const tokensBefore = estimateContextTokens(contextMessages).tokens;

  const latestCompaction = sessionManager.getLatestCompaction();
  const previousSummary = sessionManager.getPreviousCompactionSummary();
  const prevOps = fileOpsFromCompactionEntry(latestCompaction);

  const allToScan = [...cut.messagesToSummarize, ...cut.turnPrefixMessages];
  const fileOps = extractFileOps(allToScan, prevOps);

  return { cut, tokensBefore, previousSummary, fileOps };
}

export async function runCompaction(opts: {
  sessionManager: SessionManager;
  model: Model;
  settings: Settings;
  reason: CompactionReason;
  customInstructions?: string;
  signal?: AbortSignal;
}): Promise<CompactionResult> {
  const { sessionManager, model, settings, reason, customInstructions, signal } = opts;
  const prep = prepareCompaction(sessionManager, settings);
  if (!prep) {
    throw new Error("Nothing to compact — conversation is already within the keep-recent budget.");
  }

  const { cut, tokensBefore, previousSummary, fileOps } = prep;

  const summary = await summarizeConversation({
    messages: cut.messagesToSummarize,
    turnPrefixMessages: cut.isSplitTurn ? cut.turnPrefixMessages : undefined,
    previousSummary,
    customInstructions,
    model,
    settings,
    signal,
  });

  const readFiles = [...fileOps.readFiles];
  const modifiedFiles = [...fileOps.modifiedFiles];

  let enrichedSummary = summary;
  if (readFiles.length > 0 || modifiedFiles.length > 0) {
    const fileSection: string[] = [];
    if (readFiles.length > 0) {
      fileSection.push("<read-files>\n" + readFiles.join("\n") + "\n</read-files>");
    }
    if (modifiedFiles.length > 0) {
      fileSection.push("<modified-files>\n" + modifiedFiles.join("\n") + "\n</modified-files>");
    }
    enrichedSummary = `${summary}\n\n${fileSection.join("\n\n")}`;
  }

  sessionManager.appendCompaction({
    summary: enrichedSummary,
    firstKeptEntryId: cut.firstKeptEntryId,
    tokensBefore,
    reason,
    readFiles,
    modifiedFiles,
  });

  const tokensAfter = estimateContextTokens(sessionManager.getContextMessages()).tokens;

  return {
    summary: enrichedSummary,
    firstKeptEntryId: cut.firstKeptEntryId,
    tokensBefore,
    tokensAfter,
    reason,
    readFiles,
    modifiedFiles,
  };
}
