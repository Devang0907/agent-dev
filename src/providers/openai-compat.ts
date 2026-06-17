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

/** Recover tool calls Groq/Llama sometimes emit as malformed text instead of structured tool_calls. */
function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function stripToolArgWrapper(raw: string): string {
  let body = raw.trim().replace(/^[\[\]=\s]+/, "");
  if (body.startsWith("(") && body.endsWith(")")) {
    body = body.slice(1, -1).trim();
  }
  return body;
}

function argsFromFunctionTail(tail: string): string | null {
  const jsonIdx = tail.indexOf("{");
  if (jsonIdx < 0) return null;
  return parseToolArguments(tail.slice(jsonIdx));
}

function parseToolArguments(raw: string): string | null {
  const body = stripToolArgWrapper(raw);
  if (!body.startsWith("{")) return null;

  try {
    JSON.parse(body);
    return body;
  } catch {
    // Groq often truncates JSON — extract known fields.
  }

  const commandMatch = body.match(/"command"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (commandMatch) {
    return JSON.stringify({ command: unescapeJsonString(commandMatch[1]!) });
  }

  const truncatedCommand = body.match(/"command"\s*:\s*"([\s\S]+)$/);
  if (truncatedCommand) {
    const command = unescapeJsonString(truncatedCommand[1]!.replace(/\\+$/, ""));
    return JSON.stringify({ command });
  }

  const queryMatch = body.match(/"query"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (queryMatch) {
    return JSON.stringify({ query: unescapeJsonString(queryMatch[1]!) });
  }

  const truncatedQuery = body.match(/"query"\s*:\s*"([\s\S]+)$/);
  if (truncatedQuery) {
    const query = unescapeJsonString(truncatedQuery[1]!.replace(/\\+$/, ""));
    return JSON.stringify({ query });
  }

  const pathMatch = body.match(/"path"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (pathMatch) {
    return JSON.stringify({ path: unescapeJsonString(pathMatch[1]!) });
  }

  return null;
}

function pushRecovered(results: ToolCall[], name: string, args: string): void {
  results.push({
    id: `recovered_${Date.now()}_${results.length}`,
    name,
    arguments: args,
  });
}

export function parseMalformedToolCalls(text: string): ToolCall[] {
  const results: ToolCall[] = [];
  if (!text) return results;

  const tryAdd = (name: string, tail: string) => {
    const args = argsFromFunctionTail(tail);
    if (name && args) pushRecovered(results, name, args);
  };

  const closedRe = /<function=([a-zA-Z0-9_]+)([\s\S]*?)<\/function>/gi;
  let match: RegExpExecArray | null;
  while ((match = closedRe.exec(text)) !== null) {
    tryAdd(match[1]!.trim(), match[2]!);
  }

  if (results.length === 0) {
    const truncatedRe = /<function=([a-zA-Z0-9_]+)([\s\S]+)/gi;
    while ((match = truncatedRe.exec(text)) !== null) {
      tryAdd(match[1]!.trim(), match[2]!);
    }
  }

  if (results.length === 0) {
    const toolCallRe = /<tool_call>\s*([a-zA-Z0-9_]+)([\s\S]*?)<\/tool_call>/gi;
    while ((match = toolCallRe.exec(text)) !== null) {
      tryAdd(match[1]!.trim(), match[2]!);
    }
  }

  return results;
}

export function extractFailedGeneration(errorMessage: string): string | null {
  const marker = "Model output:";
  const idx = errorMessage.indexOf(marker);
  if (idx >= 0) return errorMessage.slice(idx + marker.length).trim();
  return null;
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
