import type { ChatContext, Model, StreamEvent, ToolCall } from "./types.js";
import type { Settings } from "../config/settings.js";

export const PROVIDER_ID = "gemini" as const;
export const DEFAULT_MODEL = "gemini-2.0-flash";
export const API_KEY_ENV = "GEMINI_API_KEY";
export const API_KEY_ENV_ALT = "GOOGLE_API_KEY";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const MODELS: Model[] = [
  { provider: PROVIDER_ID, id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { provider: PROVIDER_ID, id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { provider: PROVIDER_ID, id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
];

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: string } } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type FunctionDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
};

export function getApiKey(settings?: Settings): string | undefined {
  return (
    process.env[API_KEY_ENV] ??
    process.env[API_KEY_ENV_ALT] ??
    settings?.apiKeys?.gemini
  );
}

export function hasAuth(settings?: Settings): boolean {
  return !!getApiKey(settings);
}

function toFunctionDeclarations(tools: ChatContext["tools"]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));
}

function toGeminiContents(messages: ChatContext["messages"]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: JSON.parse(tc.arguments || "{}"),
            },
          });
        }
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: m.name ?? "tool",
            response: { result: m.content },
          },
        }],
      });
    }
  }

  return contents;
}

async function* parseGeminiSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // Skip malformed chunks.
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // Skip malformed chunks.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(
  model: Model,
  ctx: ChatContext,
  settings?: Settings,
): AsyncGenerator<StreamEvent> {
  const apiKey = getApiKey(settings);
  if (!apiKey) {
    yield { type: "error", message: `Missing ${API_KEY_ENV} or ${API_KEY_ENV_ALT}` };
    return;
  }

  const url = `${BASE_URL}/models/${model.id}:streamGenerateContent?alt=sse`;
  const body: Record<string, unknown> = {
    contents: toGeminiContents(ctx.messages),
  };

  if (ctx.systemPrompt) {
    body.systemInstruction = { parts: [{ text: ctx.systemPrompt }] };
  }

  if (ctx.tools.length > 0) {
    body.tools = [{ functionDeclarations: toFunctionDeclarations(ctx.tools) }];
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let message = `Gemini API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        if (errorText) message = errorText;
      }
      yield { type: "error", message };
      return;
    }

    if (!response.body) {
      yield { type: "error", message: "Gemini API returned an empty response body" };
      return;
    }

    const toolCalls: Map<number, ToolCall> = new Map();
    let toolIndex = 0;

    for await (const chunk of parseGeminiSseStream(response.body)) {
      const candidates = chunk.candidates as Array<{ content?: { parts?: GeminiPart[] } }> | undefined;
      const parts = candidates?.[0]?.content?.parts ?? [];

      for (const part of parts) {
        if ("text" in part && part.text) {
          yield { type: "text_delta", delta: part.text };
        }
        if ("functionCall" in part && part.functionCall) {
          const fc = part.functionCall;
          const idx = toolIndex++;
          const args = JSON.stringify(fc.args ?? {});
          toolCalls.set(idx, { id: `gemini_${idx}`, name: fc.name ?? "", arguments: args });
          yield {
            type: "tool_call_delta",
            index: idx,
            id: `gemini_${idx}`,
            name: fc.name,
            argumentsDelta: args,
          };
        }
      }
    }

    yield { type: "done", usage: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
