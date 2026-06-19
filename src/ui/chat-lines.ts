import type { DisplayMessage } from "./App.js";
import type { Model } from "../providers/types.js";
import { modelRef } from "../config/models.js";
import { wrapText } from "./scroll.js";
import { TOOL_ICONS } from "./theme.js";

export interface ChatLine {
  id: string;
  text: string;
  tone: "text" | "textMuted" | "primary" | "warning";
}

export function buildChatLines(
  messages: DisplayMessage[],
  opts: {
    width: number;
    model: Model;
    streamingText?: string;
    running?: boolean;
  },
): ChatLine[] {
  const lines: ChatLine[] = [];
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const userWidth = Math.max(10, opts.width - 2);

  for (const msg of messages) {
    if (msg.role === "user") {
      for (const [i, line] of wrapText(msg.content, userWidth).entries()) {
        lines.push({ id: `${msg.id}-u-${i}`, text: `│ ${line}`, tone: "text" });
      }
      lines.push({ id: `${msg.id}-gap`, text: "", tone: "text" });
      continue;
    }

    if (msg.role === "assistant") {
      const contentWidth = Math.max(10, opts.width - 2);
      for (const [i, line] of wrapText(msg.content || "", contentWidth).entries()) {
        lines.push({ id: `${msg.id}-a-${i}`, text: `  ${line}`, tone: "text" });
      }
      if (msg.id === lastAssistantId && !opts.running) {
        lines.push({
          id: `${msg.id}-model`,
          text: `  ▣ ${modelRef(opts.model)}`,
          tone: "textMuted",
        });
      }
      lines.push({ id: `${msg.id}-gap`, text: "", tone: "text" });
      continue;
    }

    const icon = TOOL_ICONS[msg.toolName ?? ""] ?? "·";
    const toolLines = msg.content.split("\n");
    for (const [i, line] of toolLines.entries()) {
      const prefix = i === 0 ? `  ${icon} ` : "     ";
      for (const [j, wline] of wrapText(line, Math.max(10, opts.width - prefix.length)).entries()) {
        lines.push({
          id: `${msg.id}-t-${i}-${j}`,
          text: `${j === 0 ? prefix : "     "}${wline}`,
          tone: "textMuted",
        });
      }
    }
  }

  if (opts.streamingText) {
    const contentWidth = Math.max(10, opts.width - 2);
    for (const [i, line] of wrapText(opts.streamingText, contentWidth).entries()) {
      lines.push({ id: `stream-${i}`, text: `  ${line}`, tone: "text" });
    }
    lines.push({ id: "stream-spin", text: "  …", tone: "textMuted" });
  } else if (opts.running && messages.length > 0) {
    lines.push({ id: "working", text: "  working…", tone: "textMuted" });
  }

  return lines;
}
