import type { ToolCall } from "../../providers/types.js";

const TELEGRAM_MAX_LENGTH = 4096;
const CHUNK_SIZE = 4000;

/** Escape characters that break Telegram MarkdownV2. Use plain text mode when unsure. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function chunkMessage(text: string, maxLen = CHUNK_SIZE): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}

export function formatToolStatus(toolCall: ToolCall): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
  } catch {
    // ignore parse errors
  }
  const name = toolCall.name;
  const cmd = typeof args.command === "string" ? args.command : undefined;
  if (name === "bash" || name === "exec") {
    return `Running: ${truncate(cmd ?? name, 200)}`;
  }
  if (name === "git") {
    const action = typeof args.action === "string" ? args.action : "git";
    return `Running: git ${action}`;
  }
  return `Running: ${name}`;
}

export function formatPermissionMessage(command: string, workerId?: string, runId?: string): string {
  const workerTag = workerId && runId ? ` [${workerId}#${runId}]` : "";
  return `Command approval required${workerTag}:\n\n${truncate(command, 1500)}`;
}

export { TELEGRAM_MAX_LENGTH };
