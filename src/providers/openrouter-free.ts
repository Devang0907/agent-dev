import OpenAI from "openai";
import type { ChatContext, Model, StreamEvent } from "./types.js";
import type { Settings } from "../config/settings.js";
import {
  toOpenAIMessages,
  toOpenAITools,
  processOpenAIStream,
  formatApiError,
} from "./openai-compat.js";

export const PROVIDER_ID = "free" as const;
export const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
export const API_KEY_ENV = "OPENROUTER_API_KEY";
export const BASE_URL = "https://openrouter.ai/api/v1";

export const MODELS: Model[] = [
  {
    provider: PROVIDER_ID,
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "qwen/qwen-2.5-72b-instruct:free",
    name: "Qwen 2.5 72B (free)",
  },
];

export function getApiKey(settings?: Settings): string | undefined {
  return process.env[API_KEY_ENV] ?? settings?.apiKeys?.free;
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

  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/agent-dev",
      "X-Title": "agent-dev",
    },
  });

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
