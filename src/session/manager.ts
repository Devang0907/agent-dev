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

export interface SessionEntry {
  type: "meta" | "message" | "model_change";
  id: string;
  timestamp: string;
  data: ChatMessage | { provider: string; modelId: string } | SessionMeta;
}

export interface SessionSummary {
  sessionId: string;
  updatedAt: Date;
  title: string;
  messageCount: number;
}

export class SessionManager {
  readonly sessionId: string;
  readonly sessionPath: string;
  private messages: ChatMessage[] = [];
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
        if (entry.type === "meta") {
          this.title = (entry.data as SessionMeta).title;
        } else if (entry.type === "message") {
          this.messages.push(entry.data as ChatMessage);
        }
      } catch {
        // skip bad lines
      }
    }
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getTitle(): string | undefined {
    return this.title;
  }

  getDisplayTitle(): string {
    if (this.title) return this.title;
    const firstUser = this.messages.find((m) => m.role === "user");
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
    this.messages.push(msg);
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

  appendModelChange(model: Model): void {
    this.appendEntry({
      type: "model_change",
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      data: { provider: model.provider, modelId: model.id },
    });
  }

  private appendEntry(entry: SessionEntry): void {
    appendFileSync(this.sessionPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  clear(): void {
    this.messages = [];
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
