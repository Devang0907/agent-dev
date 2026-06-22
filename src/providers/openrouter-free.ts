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

/** Retired OpenRouter :free slugs → current replacements */
export const DEPRECATED_FREE_MODELS: Record<string, string> = {
  "qwen/qwen-2.5-72b-instruct:free": "qwen/qwen3-235b-a22b:free",
  "google/gemini-2.0-flash-exp:free": "google/gemma-3-27b-it:free",
};

/** Ordered fallbacks when a free model is temporarily unavailable */
export const FREE_MODEL_FALLBACK_CHAIN = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
  "qwen/qwen3-235b-a22b:free",
  "openrouter/free",
] as const;

export const MODELS: Model[] = [
  {
    provider: PROVIDER_ID,
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "deepseek/deepseek-r1:free",
    name: "DeepSeek R1 (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "openrouter/free",
    name: "Free auto (OpenRouter)",
  },
];

export function resolveFreeModelId(id: string): string {
  return DEPRECATED_FREE_MODELS[id] ?? id;
}

export function isUnavailableFreeModelError(message: string): boolean {
  return /unavailable for free|no longer available|is not available|model not found/i.test(
    message,
  );
}

function fallbackChainFor(modelId: string): string[] {
  const resolved = resolveFreeModelId(modelId);
  const chain = [resolved, ...FREE_MODEL_FALLBACK_CHAIN.filter((id) => id !== resolved)];
  return [...new Set(chain)];
}

export function getApiKey(settings?: Settings): string | undefined {
  return process.env[API_KEY_ENV] ?? settings?.apiKeys?.free;
}

export function hasAuth(settings?: Settings): boolean {
  return !!getApiKey(settings);
}

async function* streamChatOnce(
  modelId: string,
  client: OpenAI,
  ctx: ChatContext,
): AsyncGenerator<StreamEvent> {
  const hasTools = ctx.tools.length > 0;

  const stream = await client.chat.completions.create(
    {
      model: modelId,
      messages: toOpenAIMessages(ctx),
      tools: hasTools ? toOpenAITools(ctx.tools) : undefined,
      tool_choice: hasTools ? "auto" : undefined,
      parallel_tool_calls: false,
      stream: true,
    },
    { signal: ctx.signal },
  );

  yield* processOpenAIStream(stream);
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

  const candidates = fallbackChainFor(model.id);

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i]!;
    try {
      let failed = false;

      for await (const event of streamChatOnce(modelId, client, ctx)) {
        if (event.type === "error") {
          if (isUnavailableFreeModelError(event.message) && i < candidates.length - 1) {
            failed = true;
            break;
          }
          yield event;
          return;
        }
        yield event;
      }

      if (!failed) return;
    } catch (err) {
      const message = formatApiError(err);
      if (isUnavailableFreeModelError(message) && i < candidates.length - 1) {
        continue;
      }
      yield { type: "error", message };
      return;
    }
  }
}
