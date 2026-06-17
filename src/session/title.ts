import { streamChat } from "../providers/registry.js";
import type { Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";

export function fallbackTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  if (cleaned.length <= 48) return cleaned;
  return cleaned.slice(0, 45) + "…";
}

export async function generateSessionTitle(
  model: Model,
  settings: Settings,
  firstMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  const fallback = fallbackTitle(firstMessage);
  try {
    let text = "";
    for await (const event of streamChat(
      model,
      {
        messages: [{ role: "user", content: firstMessage }],
        tools: [],
        systemPrompt:
          "Generate a short chat title (3-6 words) summarizing the user's request. Reply with only the title. No quotes.",
        signal,
      },
      settings,
    )) {
      if (event.type === "text_delta") text += event.delta;
      if (event.type === "error") return fallback;
    }
    const title = text
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    return title || fallback;
  } catch {
    return fallback;
  }
}
