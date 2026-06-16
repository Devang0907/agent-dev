import OpenAI from "openai";
import type { ChatContext, Model, StreamEvent } from "./types.js";
import type { Settings } from "../config/settings.js";
import {
  toOpenAIMessages,
  toOpenAITools,
  processOpenAIStream,
  formatApiError,
} from "./openai-compat.js";

export const PROVIDER_ID = "groq" as const;
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";
export const API_KEY_ENV = "GROQ_API_KEY";
export const BASE_URL = "https://api.groq.com/openai/v1";

export const MODELS: Model[] = [
  { provider: PROVIDER_ID, id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
  { provider: PROVIDER_ID, id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
];

export function getApiKey(settings?: Settings): string | undefined {
  return process.env[API_KEY_ENV] ?? settings?.apiKeys?.groq;
}

export function hasAuth(settings?: Settings): boolean {
  return !!getApiKey(settings);
}

export async function* streamChat(
  model: Model,
  ctx: ChatContext,
  settings?: Settings,
): AsyncGenerator<StreamEvent> {
  const apiKey = getApiKey(settings);
  if (!apiKey) {
    yield { type: "error", message: `Missing ${API_KEY_ENV}` };
    return;
  }

  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const hasTools = ctx.tools.length > 0;

  try {
    const stream = await client.chat.completions.create({
      model: model.id,
      messages: toOpenAIMessages(ctx),
      tools: hasTools ? toOpenAITools(ctx.tools) : undefined,
      tool_choice: hasTools ? "auto" : undefined,
      parallel_tool_calls: false,
      stream: true,
    }, { signal: ctx.signal });

    yield* processOpenAIStream(stream);
  } catch (err) {
    yield { type: "error", message: formatApiError(err) };
  }
}
