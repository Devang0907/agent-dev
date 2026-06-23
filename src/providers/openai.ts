import OpenAI from "openai";
import type { ChatContext, Model, StreamEvent, ToolCall } from "./types.js";
import type { Settings } from "../config/settings.js";

export const PROVIDER_ID = "openai" as const;
export const DEFAULT_MODEL = "gpt-4o";
export const API_KEY_ENV = "OPENAI_API_KEY";
export const BASE_URL = "https://api.openai.com/v1";

export const MODELS: Model[] = [
  { provider: PROVIDER_ID, id: "gpt-4o", name: "GPT-4o" },
  { provider: PROVIDER_ID, id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { provider: PROVIDER_ID, id: "gpt-4.1", name: "GPT-4.1" },
  { provider: PROVIDER_ID, id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
  { provider: PROVIDER_ID, id: "o4-mini", name: "o4-mini" },
  { provider: PROVIDER_ID, id: "o3-mini", name: "o3-mini" },
];

export function getApiKey(settings?: Settings): string | undefined {
  return process.env[API_KEY_ENV] ?? settings?.apiKeys?.openai;
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

  const client = new OpenAI({ apiKey, baseURL: BASE_URL });

  try {
    const stream = await client.chat.completions.create({
      model: model.id,
      messages: toOpenAIMessages(ctx),
      tools: ctx.tools.length > 0 ? toOpenAITools(ctx.tools) : undefined,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: ctx.signal });

    const toolCalls: Map<number, ToolCall> = new Map();
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
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

    yield { type: "done", usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
