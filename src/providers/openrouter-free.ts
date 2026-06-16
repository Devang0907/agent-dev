import OpenAI from "openai";
import type { ChatContext, Model, StreamEvent, ToolCall } from "./types.js";
import type { Settings } from "../config/settings.js";

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

function toOpenAIMessages(ctx: ChatContext): OpenAI.Chat.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (ctx.systemPrompt) {
    msgs.push({ role: "system", content: ctx.systemPrompt });
  }
  for (const m of ctx.messages) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.toolCalls?.length) {
        msgs.push({
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else {
        msgs.push({ role: "assistant", content: m.content });
      }
    } else if (m.role === "tool") {
      msgs.push({
        role: "tool",
        tool_call_id: m.toolCallId!,
        content: m.content,
      });
    }
  }
  return msgs;
}

function toOpenAITools(tools: ChatContext["tools"]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
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

  try {
    const stream = await client.chat.completions.create({
      model: model.id,
      messages: toOpenAIMessages(ctx),
      tools: ctx.tools.length > 0 ? toOpenAITools(ctx.tools) : undefined,
      stream: true,
    }, { signal: ctx.signal });

    const toolCalls: Map<number, ToolCall> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text_delta", delta: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" });
          }
          const existing = toolCalls.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) {
            existing.arguments += tc.function.arguments;
            yield {
              type: "tool_call_delta",
              index: idx,
              id: existing.id,
              name: existing.name,
              argumentsDelta: tc.function.arguments,
            };
          }
        }
      }
    }

    yield { type: "done" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
