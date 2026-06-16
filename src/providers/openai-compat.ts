import type OpenAI from "openai";
import type { ChatContext, StreamEvent, ToolCall } from "./types.js";

export function sanitizeToolParameters(params: Record<string, unknown>): Record<string, unknown> {
  return {
    ...params,
    type: "object",
    additionalProperties: false,
  };
}

export function toOpenAITools(tools: ChatContext["tools"]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: sanitizeToolParameters(t.parameters),
    },
  }));
}

export function normalizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.map((tc, i) => ({
    id: tc.id?.trim() || `call_${Date.now()}_${i}`,
    name: tc.name,
    arguments: tc.arguments?.trim() || "{}",
  }));
}

export function toOpenAIMessages(ctx: ChatContext): OpenAI.Chat.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (ctx.systemPrompt) {
    msgs.push({ role: "system", content: ctx.systemPrompt });
  }
  for (const m of ctx.messages) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.toolCalls?.length) {
        const toolCalls = normalizeToolCalls(m.toolCalls);
        msgs.push({
          role: "assistant",
          content: m.content || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
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
        ...(m.name ? { name: m.name } : {}),
      });
    }
  }
  return msgs;
}

export async function* processOpenAIStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
): AsyncGenerator<StreamEvent> {
  const toolCalls: Map<number, ToolCall> = new Map();

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.finish_reason === "tool_calls" || choice?.delta?.tool_calls) {
      // normal path
    }

    const delta = choice?.delta;
    if (!delta) continue;

    if (delta.content) {
      yield { type: "text_delta", delta: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
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

    if (chunk.usage) {
      yield {
        type: "done",
        usage: {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        },
      };
    }
  }

  yield { type: "done" };
}

export function formatApiError(err: unknown): string {
  const apiErr = err as { message?: string; error?: { message?: string; failed_generation?: string } };
  const failed = apiErr.error?.failed_generation;
  const msg = apiErr.error?.message ?? apiErr.message ?? "API error";
  if (failed) return `${msg}\nModel output: ${failed.slice(0, 300)}`;
  return msg;
}
