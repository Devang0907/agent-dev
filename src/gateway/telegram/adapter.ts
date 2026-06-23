import type { Api, Context } from "grammy";
import type { AgentSession, SessionEvent } from "../../agent/session.js";
import type { CoreAgentEvent } from "../../agent/loop.js";
import type { PermissionRequest } from "../../agent/loop.js";
import type { ToolCall } from "../../providers/types.js";
import { chunkMessage, formatPermissionMessage, formatToolStatus, truncate } from "./format.js";

const APPROVE_PREFIX = "approve:";
const DENY_PREFIX = "deny:";

function isCoreAgentEvent(event: SessionEvent): event is CoreAgentEvent {
  return (
    event.type === "message_start" ||
    event.type === "text_delta" ||
    event.type === "tool_call" ||
    event.type === "tool_result" ||
    event.type === "turn_end" ||
    event.type === "error"
  );
}

export class TelegramSessionBridge {
  private textBuffer = "";
  private activeWorker: { runId: string; workerId: string } | null = null;
  private pendingApprovalId?: string;
  private approvalCounter = 0;

  constructor(
    readonly session: AgentSession,
    private readonly api: Api,
    private readonly chatId: number,
    private readonly verbose: boolean,
  ) {}

  attach(): void {
    this.session.on("event", this.handleEvent);
  }

  detach(): void {
    this.session.off("event", this.handleEvent);
  }

  private handleEvent = (event: SessionEvent): void => {
    void this.processEvent(event);
  };

  private async processEvent(event: SessionEvent): Promise<void> {
    if (event.type === "permission_request") {
      await this.handlePermissionRequest(event.request);
      return;
    }

    if (event.type === "delegation_start") {
      this.activeWorker = { runId: event.runId, workerId: event.workerId };
      await this.sendStatus(`[${event.workerId}] ${truncate(event.task, 300)}`);
      return;
    }

    if (event.type === "delegation_end") {
      await this.sendStatus(`[${event.workerId}] ${event.status}`);
      this.activeWorker = null;
      return;
    }

    if (event.type === "agent_event") {
      if (!this.verbose) return;
      const inner = event.event;
      if (inner.type === "tool_call") {
        await this.sendStatus(`[${event.workerId}] tool: ${inner.toolCall.name}`);
      }
      return;
    }

    if (!isCoreAgentEvent(event)) return;

    if (event.type === "text_delta" && !this.activeWorker) {
      this.textBuffer += event.delta;
      return;
    }

    if (event.type === "tool_call" && !this.activeWorker) {
      await this.sendStatus(formatToolStatus(event.toolCall));
      return;
    }

    if (event.type === "tool_result" && !this.activeWorker) {
      if (event.result.toLowerCase().includes("error") || event.result.startsWith("Error")) {
        await this.sendStatus(truncate(event.result, 500));
      }
      return;
    }

    if (event.type === "error") {
      await this.sendMessage(`Error: ${event.message}`);
      return;
    }

    if (event.type === "turn_end") {
      await this.flushTextBuffer();
    }
  }

  private async handlePermissionRequest(request: PermissionRequest): Promise<void> {
    const approvalId = String(++this.approvalCounter);
    this.pendingApprovalId = approvalId;

    const text = formatPermissionMessage(request.command, request.workerId, request.runId);
    await this.api.sendMessage(this.chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve", callback_data: `${APPROVE_PREFIX}${approvalId}` },
            { text: "Deny", callback_data: `${DENY_PREFIX}${approvalId}` },
          ],
        ],
      },
    });
  }

  async handleApprovalCallback(approvalId: string, approved: boolean, messageId: number): Promise<void> {
    if (this.pendingApprovalId !== approvalId) {
      return;
    }
    this.pendingApprovalId = undefined;
    this.session.respondToPermission(approved);

    const result = approved ? "Approved" : "Denied";
    try {
      await this.api.editMessageText(this.chatId, messageId, `${result}`);
    } catch {
      await this.sendStatus(result);
    }
  }

  async prompt(text: string): Promise<void> {
    this.textBuffer = "";
    await this.api.sendChatAction(this.chatId, "typing");
    await this.session.prompt(text);
    await this.flushTextBuffer();
  }

  private async flushTextBuffer(): Promise<void> {
    const text = this.textBuffer.trim();
    this.textBuffer = "";
    if (!text) return;

    for (const chunk of chunkMessage(text)) {
      await this.sendMessage(chunk);
    }
  }

  private async sendMessage(text: string): Promise<void> {
    try {
      await this.api.sendMessage(this.chatId, text);
    } catch (err) {
      console.error("[telegram] sendMessage failed:", err);
    }
  }

  private async sendStatus(text: string): Promise<void> {
    try {
      await this.api.sendMessage(this.chatId, text);
    } catch (err) {
      console.error("[telegram] sendStatus failed:", err);
    }
  }
}

export function parseApprovalCallback(data: string): { action: "approve" | "deny"; id: string } | null {
  if (data.startsWith(APPROVE_PREFIX)) {
    return { action: "approve", id: data.slice(APPROVE_PREFIX.length) };
  }
  if (data.startsWith(DENY_PREFIX)) {
    return { action: "deny", id: data.slice(DENY_PREFIX.length) };
  }
  return null;
}

export async function sendBusyReply(ctx: Context): Promise<void> {
  await ctx.reply("Agent is busy — wait for the current turn to finish.");
}
