import { GoogleGenAI, type Content, type Part, type FunctionDeclaration } from "@google/genai";
import type { ChatContext, Model, StreamEvent, ToolCall } from "./types.js";
import type { Settings } from "../config/settings.js";

export const PROVIDER_ID = "gemini" as const;
export const DEFAULT_MODEL = "gemini-2.0-flash";
export const API_KEY_ENV = "GEMINI_API_KEY";
export const API_KEY_ENV_ALT = "GOOGLE_API_KEY";

export const MODELS: Model[] = [
  { provider: PROVIDER_ID, id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { provider: PROVIDER_ID, id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
];

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

function toGeminiContents(messages: ChatContext["messages"]): Content[] {
  const contents: Content[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: Part[] = [];
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

  const ai = new GoogleGenAI({ apiKey });

  try {
    const stream = await ai.models.generateContentStream({
      model: model.id,
      contents: toGeminiContents(ctx.messages),
      config: {
        systemInstruction: ctx.systemPrompt,
        tools: ctx.tools.length > 0
          ? [{ functionDeclarations: toFunctionDeclarations(ctx.tools) }]
          : undefined,
        abortSignal: ctx.signal,
      },
    });

    const toolCalls: Map<number, ToolCall> = new Map();
    let toolIndex = 0;

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          yield { type: "text_delta", delta: part.text };
        }
        if (part.functionCall) {
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

      if (chunk.usageMetadata) {
        // usage available on final chunk
      }
    }

    yield {
      type: "done",
      usage: undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
