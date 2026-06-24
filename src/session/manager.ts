import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { getSessionsDir, getLastSessionPath } from "../config/paths.js";
import type { ChatMessage, Model } from "../providers/types.js";
import { fallbackTitle } from "./title.js";

export interface SessionMeta {
  title: string;
}

export type CompactionReason = "manual" | "threshold" | "overflow";

export interface CompactionData {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  reason: CompactionReason;
  readFiles?: string[];
  modifiedFiles?: string[];
}

export interface SessionEntry {
  type: "meta" | "message" | "model_change" | "compaction";
  id: string;
  timestamp: string;
  data: ChatMessage | { provider: string; modelId: string } | SessionMeta | CompactionData;
}

export const COMPACTION_SUMMARY_PREFIX = "[Earlier conversation summary]\n\n";

export interface SessionSummary {
  sessionId: string;
  updatedAt: Date;
  title: string;
  messageCount: number;
}

export class SessionManager {
  readonly sessionId: string;
  readonly sessionPath: string;
  private entries: SessionEntry[] = [];
  private title?: string;

  constructor(sessionId?: string, cwd?: string) {
    mkdirSync(getSessionsDir(), { recursive: true });
    if (sessionId) {
      this.sessionId = sessionId;
      this.sessionPath = join(getSessionsDir(), `${sessionId}.jsonl`);
      this.load();
    } else {
      const hash = createHash("sha256").update(cwd ?? process.cwd()).digest("hex").slice(0, 12);
      this.sessionId = `${hash}-${Date.now()}`;
      this.sessionPath = join(getSessionsDir(), `${this.sessionId}.jsonl`);
    }
  }

  private load(): void {
    if (!existsSync(this.sessionPath)) return;
    const lines = readFileSync(this.sessionPath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SessionEntry;
        this.entries.push(entry);
        if (entry.type === "meta") {
          this.title = (entry.data as SessionMeta).title;
        }
      } catch {
        // skip bad lines
      }
    }
  }

  getEntries(): SessionEntry[] {
    return [...this.entries];
  }

  getMessages(): ChatMessage[] {
    return this.entries
      .filter((e): e is SessionEntry & { type: "message" } => e.type === "message")
      .map((e) => e.data as ChatMessage);
  }

  getLatestCompaction(): (SessionEntry & { type: "compaction" }) | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry?.type === "compaction") {
        return entry as SessionEntry & { type: "compaction" };
      }
    }
    return undefined;
  }

  getPreviousCompactionSummary(): string | undefined {
    const latest = this.getLatestCompaction();
    if (!latest) return undefined;
    return (latest.data as CompactionData).summary;
  }

  getContextMessages(): ChatMessage[] {
    const compaction = this.getLatestCompaction();
    if (!compaction) {
      return this.getMessages();
    }

    const { summary, firstKeptEntryId } = compaction.data as CompactionData;
    const keptIndex = this.entries.findIndex((e) => e.id === firstKeptEntryId);
    if (keptIndex < 0) {
      return this.getMessages();
    }

    const kept: ChatMessage[] = [];
    for (let i = keptIndex; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry?.type === "message") {
        kept.push(entry.data as ChatMessage);
      }
    }

    const summaryMsg: ChatMessage = {
      role: "user",
      content: `${COMPACTION_SUMMARY_PREFIX}${summary}`,
    };
    return [summaryMsg, ...kept];
  }

  getTitle(): string | undefined {
    return this.title;
  }

  getDisplayTitle(): string {
    if (this.title) return this.title;
    const firstUser = this.getMessages().find((m) => m.role === "user");
    return firstUser ? fallbackTitle(firstUser.content) : "New chat";
  }

  setTitle(title: string): void {
    const trimmed = title.trim().slice(0, 60);
    if (!trimmed) return;
    this.title = trimmed;
    this.appendEntry({
      type: "meta",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      data: { title: trimmed },
    });
  }

  appendMessage(msg: ChatMessage): void {
    this.appendEntry({
      type: "message",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      data: msg,
    });
  }

  appendMessages(msgs: ChatMessage[]): void {
    for (const msg of msgs) {
      this.appendMessage(msg);
    }
  }

  appendCompaction(data: CompactionData): string {
    const id = randomUUID();
    this.appendEntry({
      type: "compaction",
      id,
      timestamp: new Date().toISOString(),
      data,
    });
    return id;
  }

  appendModelChange(model: Model): void {
    this.appendEntry({
      type: "model_change",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      data: { provider: model.provider, modelId: model.id },
    });
  }

  private appendEntry(entry: SessionEntry): void {
    this.entries.push(entry);
    appendFileSync(this.sessionPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  clear(): void {
    this.entries = [];
    this.title = undefined;
    writeFileSync(this.sessionPath, "", "utf-8");
  }

  saveAsLast(): void {
    writeFileSync(
      getLastSessionPath(),
      JSON.stringify({ sessionId: this.sessionId, path: this.sessionPath }),
      "utf-8",
    );
  }

  static loadLast(): SessionManager | undefined {
    if (!existsSync(getLastSessionPath())) return undefined;
    try {
      const { sessionId } = JSON.parse(readFileSync(getLastSessionPath(), "utf-8"));
      return new SessionManager(sessionId);
    } catch {
      return undefined;
    }
  }

  static listSessions(): SessionSummary[] {
    mkdirSync(getSessionsDir(), { recursive: true });
    const files = readdirSync(getSessionsDir()).filter((f) => f.endsWith(".jsonl"));
    return files
      .map((file) => {
        const sessionId = file.replace(/\.jsonl$/, "");
        const sessionPath = join(getSessionsDir(), file);
        const stat = statSync(sessionPath);
        const mgr = new SessionManager(sessionId);
        const messageCount = mgr
          .getMessages()
          .filter((m) => m.role === "user" || m.role === "assistant").length;
        return {
          sessionId,
          updatedAt: stat.mtime,
          title: mgr.getDisplayTitle(),
          messageCount,
        };
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
