import type { ChatMessage } from "../../providers/types.js";
import type { SessionEntry } from "../../session/manager.js";
import { estimateMessageTokens } from "./tokens.js";

const TOOL_RESULT_MAX_CHARS = 2000;

export function truncateToolContent(content: string, max = TOOL_RESULT_MAX_CHARS): string {
  if (content.length <= max) return content;
  const omitted = content.length - max;
  return `${content.slice(0, max)}\n… [${omitted} chars truncated for summarization]`;
}

export function serializeMessage(message: ChatMessage): string {
  switch (message.role) {
    case "user":
      return `[User]: ${message.content}`;
    case "assistant": {
      const parts: string[] = [];
      if (message.content.trim()) {
        parts.push(`[Assistant]: ${message.content}`);
      }
      if (message.toolCalls?.length) {
        const calls = message.toolCalls
          .map((tc) => `${tc.name}(${tc.arguments})`)
          .join("; ");
        parts.push(`[Assistant tool calls]: ${calls}`);
      }
      return parts.join("\n");
    }
    case "tool":
      return `[Tool result${message.name ? ` (${message.name})` : ""}]: ${truncateToolContent(message.content)}`;
    default:
      return `[${message.role}]: ${message.content}`;
  }
}

export function serializeConversation(messages: ChatMessage[]): string {
  return messages.map(serializeMessage).join("\n\n");
}
