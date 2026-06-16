import { randomUUID } from "node:crypto";
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SESSIONS_DIR, LAST_SESSION_PATH } from "../config/paths.js";
import type { ChatMessage, Model } from "../providers/types.js";

export interface SessionEntry {
  type: "message" | "model_change";
  id: string;
  timestamp: string;
  data: ChatMessage | { provider: string; modelId: string };
}

export class SessionManager {
  readonly sessionId: string;
  readonly sessionPath: string;
  private messages: ChatMessage[] = [];

  constructor(sessionId?: string, cwd?: string) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    if (sessionId) {
      this.sessionId = sessionId;
      this.sessionPath = join(SESSIONS_DIR, `${sessionId}.jsonl`);
      this.load();
    } else {
      const hash = createHash("sha256").update(cwd ?? process.cwd()).digest("hex").slice(0, 12);
      this.sessionId = `${hash}-${Date.now()}`;
      this.sessionPath = join(SESSIONS_DIR, `${this.sessionId}.jsonl`);
    }
  }

  private load(): void {
    if (!existsSync(this.sessionPath)) return;
    const lines = readFileSync(this.sessionPath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SessionEntry;
        if (entry.type === "message") {
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
    writeFileSync(this.sessionPath, "", "utf-8");
  }

  saveAsLast(): void {
    writeFileSync(
      LAST_SESSION_PATH,
      JSON.stringify({ sessionId: this.sessionId, path: this.sessionPath }),
      "utf-8",
    );
  }

  static loadLast(): SessionManager | undefined {
    if (!existsSync(LAST_SESSION_PATH)) return undefined;
    try {
      const { sessionId } = JSON.parse(readFileSync(LAST_SESSION_PATH, "utf-8"));
      return new SessionManager(sessionId);
    } catch {
      return undefined;
    }
  }
}
