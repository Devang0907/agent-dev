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

/**
 * Retired OpenRouter :free slugs → current replacements.
 * Verified against GET https://openrouter.ai/api/v1/models (June 2026).
 */
export const DEPRECATED_FREE_MODELS: Record<string, string> = {
  "deepseek/deepseek-r1:free": "qwen/qwen3-next-80b-a3b-instruct:free",
  "deepseek/deepseek-r1-0528:free": "qwen/qwen3-next-80b-a3b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free": "openrouter/free",
  "qwen/qwen3-235b-a22b:free": "qwen/qwen3-coder:free",
  "qwen/qwen-2.5-72b-instruct:free": "qwen/qwen3-coder:free",
  "google/gemma-3-27b-it:free": "google/gemma-4-26b-a4b-it:free",
  "google/gemini-2.0-flash-exp:free": "google/gemma-4-26b-a4b-it:free",
};

/** Ordered fallbacks when a free model is unavailable (router first). */
export const FREE_MODEL_FALLBACK_CHAIN = [
  "openrouter/free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-coder:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

/** Free models that support tool calling (required for agent-dev). */
export const MODELS: Model[] = [
  {
    provider: PROVIDER_ID,
    id: "openrouter/free",
    name: "Free auto (OpenRouter)",
  },
  {
    provider: PROVIDER_ID,
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    name: "Qwen3 Next 80B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "openai/gpt-oss-20b:free",
    name: "GPT-OSS 20B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super 120B (free)",
  },
  {
    provider: PROVIDER_ID,
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Gemma 4 26B (free)",
  },
];

export function resolveFreeModelId(id: string): string {
  let current = id;
  const seen = new Set<string>();
  while (DEPRECATED_FREE_MODELS[current] && !seen.has(current)) {
    seen.add(current);
    current = DEPRECATED_FREE_MODELS[current]!;
  }
  return current;
}

export function isUnavailableFreeModelError(message: string): boolean {
  return /unavailable for free|no longer available|is not available|model not found|not found|no endpoints|invalid model|does not exist|not a valid model|rate.?limit|too many requests|429|temporarily unavailable|overloaded|503|502|provider returned error/i.test(
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
      "HTTP-Referer": "https://github.com/Devang0907/agent-dev",
      "X-Title": "agent-dev",
    },
  });

  const requestedId = resolveFreeModelId(model.id);
  const candidates = fallbackChainFor(model.id);
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i]!;
    try {
      let failed = false;
      let lastError = "";

      for await (const event of streamChatOnce(modelId, client, ctx)) {
        if (event.type === "error") {
          lastError = event.message;
          if (isUnavailableFreeModelError(event.message) && i < candidates.length - 1) {
            failed = true;
            break;
          }
          yield event;
          return;
        }
        yield event;
      }

      if (failed) {
        errors.push(`${modelId}: ${lastError}`);
        continue;
      }
      return;
    } catch (err) {
      const message = formatApiError(err);
      if (isUnavailableFreeModelError(message) && i < candidates.length - 1) {
        errors.push(`${modelId}: ${message}`);
        continue;
      }
      yield { type: "error", message };
      return;
    }
  }

  const tried = candidates.join(", ");
  const detail = errors.length > 0 ? `\n${errors.join("\n")}` : "";
  yield {
    type: "error",
    message:
      `All free model fallbacks failed (requested ${requestedId}). ` +
      `Tried: ${tried}. ` +
      `OpenRouter retires free models often — try /model openrouter/free or update agent-dev.${detail}`,
  };
}
