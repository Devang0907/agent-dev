import type { Api, Context } from "grammy";
import type { AgentSession, SessionEvent } from "../../agent/session.js";
import type { CoreAgentEvent } from "../../agent/loop.js";
import type { PermissionRequest } from "../../agent/loop.js";
import type { ToolCall } from "../../providers/types.js";
import { chunkMessage, formatPermissionMessage, formatToolStatus, stripMalformedToolText, truncate } from "./format.js";
import {
  logAgentEnd,
  logAgentStart,
  logAgentText,
  logApprovalRequest,
  logApprovalResult,
  logDelegationEnd,
  logDelegationStart,
  logError,
  logGateway,
  logToolCall,
  logToolResult,
} from "./logger.js";

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
  private agentLineStarted = false;

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
    void this.processEvent(event).catch((err) => {
      console.error("[telegram] Event handler error:", err);
      if (event.type === "permission_request") {
        this.pendingApprovalId = undefined;
        this.session.respondToPermission(false);
        void this.sendMessage("Approval UI failed — command denied. Try again.");
      }
    });
  };

  private async processEvent(event: SessionEvent): Promise<void> {
    if (event.type === "permission_request") {
      await this.handlePermissionRequest(event.request);
      return;
    }

    if (event.type === "delegation_start") {
      this.activeWorker = { runId: event.runId, workerId: event.workerId };
      logDelegationStart(event.workerId, event.runId, event.task);
      await this.sendStatus(`[${event.workerId}] ${truncate(event.task, 300)}`);
      return;
    }

    if (event.type === "delegation_end") {
      logDelegationEnd(event.workerId, event.runId, event.status);
      await this.sendStatus(`[${event.workerId}] ${event.status}`);
      this.activeWorker = null;
      return;
    }

    if (event.type === "agent_event") {
      const inner = event.event;
      if (inner.type === "tool_call") {
        logToolCall(inner.toolCall, event.workerId);
        if (this.verbose) {
          await this.sendStatus(`[${event.workerId}] tool: ${inner.toolCall.name}`);
        }
      } else if (inner.type === "tool_result" && this.verbose) {
        logToolResult(inner.result, event.workerId);
      }
      return;
    }

    if (!isCoreAgentEvent(event)) return;

    if (event.type === "message_start" && event.role === "assistant" && !this.activeWorker) {
      this.agentLineStarted = false;
      return;
    }

    if (event.type === "text_delta" && !this.activeWorker) {
      if (!/<\/?function/i.test(event.delta)) {
        if (!this.agentLineStarted) {
          logAgentStart();
          this.agentLineStarted = true;
        }
        logAgentText(event.delta);
      }
      this.textBuffer += event.delta;
      return;
    }

    if (event.type === "tool_call" && !this.activeWorker) {
      if (this.agentLineStarted) {
        logAgentEnd();
        this.agentLineStarted = false;
      }
      logToolCall(event.toolCall);
      await this.sendStatus(formatToolStatus(event.toolCall));
      return;
    }

    if (event.type === "tool_result" && !this.activeWorker) {
      logToolResult(event.result);
      if (event.result.toLowerCase().includes("error") || event.result.startsWith("Error")) {
        await this.sendStatus(truncate(event.result, 500));
      }
      return;
    }

    if (event.type === "error") {
      if (this.agentLineStarted) {
        logAgentEnd();
        this.agentLineStarted = false;
      }
      logError(event.message);
      await this.sendMessage(`Error: ${event.message}`);
      return;
    }

    if (event.type === "turn_end") {
      if (this.agentLineStarted) {
        logAgentEnd();
        this.agentLineStarted = false;
      }
      await this.flushTextBuffer();
    }
  }

  private async handlePermissionRequest(request: PermissionRequest): Promise<void> {
    const approvalId = String(++this.approvalCounter);
    this.pendingApprovalId = approvalId;

    logApprovalRequest(request.command, request.workerId, request.runId);

    const text = formatPermissionMessage(request.command, request.workerId, request.runId);
    try {
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
      logGateway("Approval buttons sent — tap Approve or Deny in Telegram");
    } catch (err) {
      console.error("[telegram] Failed to send approval request:", err);
      this.pendingApprovalId = undefined;
      this.session.respondToPermission(false);
      await this.sendMessage("Could not send approval buttons — command denied. Try again.");
    }
  }

  async handleApprovalCallback(approvalId: string, approved: boolean, messageId: number): Promise<void> {
    if (this.pendingApprovalId !== approvalId) {
      return;
    }
    this.pendingApprovalId = undefined;
    this.session.respondToPermission(approved);
    logApprovalResult(approved);

    const result = approved ? "Approved" : "Denied";
    try {
      await this.api.editMessageText(this.chatId, messageId, result, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      try {
        await this.api.editMessageReplyMarkup(this.chatId, messageId, {
          reply_markup: { inline_keyboard: [] },
        });
      } catch {
        await this.sendStatus(result);
      }
    }
  }

  async prompt(text: string): Promise<void> {
    this.textBuffer = "";
    this.agentLineStarted = false;
    await this.api.sendChatAction(this.chatId, "typing");
    await this.session.prompt(text);
    await this.flushTextBuffer();
  }

  private async flushTextBuffer(): Promise<void> {
    const text = stripMalformedToolText(this.textBuffer);
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
