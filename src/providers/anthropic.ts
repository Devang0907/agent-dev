import type { ChatContext, Model, StreamEvent, ToolCall, ToolDefinition } from "./types.js";
import type { Settings } from "../config/settings.js";

export const PROVIDER_ID = "anthropic" as const;
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const API_KEY_ENV = "ANTHROPIC_API_KEY";
const BASE_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const MODELS: Model[] = [
  { provider: PROVIDER_ID, id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { provider: PROVIDER_ID, id: "claude-opus-4-8", name: "Claude Opus 4.8" },
  { provider: PROVIDER_ID, id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { provider: PROVIDER_ID, id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
  { provider: PROVIDER_ID, id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
];

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export function getApiKey(settings?: Settings): string | undefined {
  return process.env[API_KEY_ENV] ?? settings?.apiKeys?.anthropic;
}

export function hasAuth(settings?: Settings): boolean {
  return !!getApiKey(settings);
}

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function toAnthropicMessages(messages: ChatContext["messages"]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i]!;

    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      i++;
      continue;
    }

    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input });
      }
      out.push({
        role: "assistant",
        content: blocks.length > 0 ? blocks : m.content,
      });
      i++;
      continue;
    }

    if (m.role === "tool") {
      const results: AnthropicContentBlock[] = [];
      while (i < messages.length && messages[i]?.role === "tool") {
        const t = messages[i]!;
        results.push({
          type: "tool_result",
          tool_use_id: t.toolCallId ?? "",
          content: t.content,
        });
        i++;
      }
      out.push({ role: "user", content: results });
      continue;
    }

    i++;
  }

  return out;
}

async function* parseAnthropicSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          eventName = "";
          continue;
        }
        if (trimmed.startsWith("event:")) {
          eventName = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          const data = JSON.parse(payload) as Record<string, unknown>;
          yield { ...data, _event: eventName };
        } catch {
          // Skip malformed chunks.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function formatAnthropicError(status: number, errorText: string): string {
  let message = `Anthropic API error (${status})`;
  try {
    const parsed = JSON.parse(errorText) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    if (errorText) message = errorText;
  }
  return message;
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

  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: 8192,
    messages: toAnthropicMessages(ctx.messages),
    stream: true,
  };

  if (ctx.systemPrompt) {
    body.system = ctx.systemPrompt;
  }

  if (ctx.tools.length > 0) {
    body.tools = toAnthropicTools(ctx.tools);
  }

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", message: formatAnthropicError(response.status, errorText) };
      return;
    }

    if (!response.body) {
      yield { type: "error", message: "Anthropic API returned an empty response body" };
      return;
    }

    const toolCalls: Map<number, ToolCall> = new Map();

    for await (const chunk of parseAnthropicSseStream(response.body)) {
      const eventType = String(chunk._event ?? chunk.type ?? "");

      if (eventType === "error") {
        const err = chunk.error as { message?: string } | undefined;
        yield { type: "error", message: err?.message ?? "Anthropic stream error" };
        return;
      }

      if (chunk.type === "content_block_delta") {
        const index = chunk.index as number;
        const delta = chunk.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        if (delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text_delta", delta: delta.text };
        }

        if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const existing = toolCalls.get(index);
          if (existing) {
            existing.arguments += delta.partial_json;
            yield {
              type: "tool_call_delta",
              index,
              id: existing.id,
              name: existing.name,
              argumentsDelta: delta.partial_json,
            };
          }
        }
      }

      if (chunk.type === "content_block_start") {
        const index = chunk.index as number;
        const block = chunk.content_block as Record<string, unknown> | undefined;
        if (block?.type === "tool_use") {
          const id = String(block.id ?? `toolu_${index}`);
          const name = String(block.name ?? "");
          toolCalls.set(index, { id, name, arguments: "" });
          yield { type: "tool_call_delta", index, id, name, argumentsDelta: "" };
        }
      }
    }

    yield { type: "done", usage: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
