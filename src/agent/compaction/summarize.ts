import { streamChat } from "../../providers/registry.js";
import type { ChatMessage, Model } from "../../providers/types.js";
import type { Settings } from "../../config/settings.js";
import { serializeConversation } from "./serialize.js";
import { buildSummarizationPrompt, SUMMARIZATION_SYSTEM_PROMPT } from "./prompt.js";

export async function summarizeConversation(opts: {
  messages: ChatMessage[];
  turnPrefixMessages?: ChatMessage[];
  previousSummary?: string;
  customInstructions?: string;
  model: Model;
  settings: Settings;
  signal?: AbortSignal;
}): Promise<string> {
  const {
    messages,
    turnPrefixMessages = [],
    previousSummary,
    customInstructions,
    model,
    settings,
    signal,
  } = opts;

  const conversationParts: string[] = [];
  if (messages.length > 0) {
    conversationParts.push(serializeConversation(messages));
  }
  if (turnPrefixMessages.length > 0) {
    conversationParts.push(
      "Partial turn prefix (early part of current turn):\n" +
        serializeConversation(turnPrefixMessages),
    );
  }

  const userContent = [
    conversationParts.join("\n\n"),
    buildSummarizationPrompt({ previousSummary, customInstructions }),
  ].join("\n\n");

  let text = "";
  for await (const event of streamChat(
    model,
    {
      messages: [{ role: "user", content: userContent }],
      tools: [],
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      signal,
    },
    settings,
  )) {
    if (event.type === "text_delta") text += event.delta;
    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  const summary = text.trim();
  if (!summary) {
    throw new Error("Compaction summarization returned empty result");
  }
  return summary;
}
