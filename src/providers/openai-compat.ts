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

export function sanitizeToolName(name: string): string {
  let n = name.trim();
  if (!n) return n;

  // GPT-OSS Harmony leak: browser<|channel|>commentary → browser
  const channelIdx = n.indexOf("<|channel|>");
  if (channelIdx >= 0) n = n.slice(0, channelIdx);

  const harmonyIdx = n.indexOf("<|");
  if (harmonyIdx >= 0) n = n.slice(0, harmonyIdx);

  if (n.startsWith("functions.")) n = n.slice("functions.".length);

  n = n.trim();

  // Some providers re-send the full tool name each stream chunk → browserbrowser
  if (n.length >= 2 && n.length % 2 === 0) {
    const half = n.slice(0, n.length / 2);
    if (half === n.slice(n.length / 2)) n = half;
  }

  return n;
}

/** Merge streamed tool-name fragments without duplicating full names. */
export function mergeToolNameChunk(existing: string, chunk: string): string {
  if (!chunk) return existing;
  if (!existing) return chunk;
  if (chunk === existing) return existing;
  if (existing.endsWith(chunk) && chunk.length < existing.length) return existing;
  if (chunk.startsWith(existing)) return chunk;
  if (existing.startsWith(chunk)) return existing;
  return existing + chunk;
}

export function normalizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.map((tc, i) => ({
    id: tc.id?.trim() || `call_${Date.now()}_${i}`,
    name: sanitizeToolName(tc.name),
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
  const cleaned = tail.trim().replace(/^[,=>\s]+/, "");
  const jsonIdx = cleaned.indexOf("{");
  const source = jsonIdx >= 0 ? cleaned.slice(jsonIdx) : cleaned;
  if (jsonIdx >= 0) {
    const parsed = parseToolArguments(source);
    if (parsed) return parsed;
  }

  // Groq/Llama sometimes emit ("query": "value") without braces.
  let body = stripToolArgWrapper(cleaned);
  if (!body.startsWith("{") && body.includes(":")) {
    body = `{${body}}`;
  }
  return parseToolArguments(body);
}

function extractStringArrayField(body: string, field: string): string[] | undefined {
  const block = body.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)(?:\\]|$)`));
  if (!block) return undefined;
  const values: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block[1]!)) !== null) {
    const value = unescapeJsonString(match[1]!);
    if (value.trim()) values.push(value.trim());
  }
  return values.length > 0 ? values : undefined;
}

function parsePlanArguments(body: string): string | null {
  const actionMatch = body.match(/"action"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!actionMatch) return null;

  const out: Record<string, unknown> = {
    action: unescapeJsonString(actionMatch[1]!),
  };

  const titleMatch = body.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (titleMatch) out.title = unescapeJsonString(titleMatch[1]!);

  const tasks = extractStringArrayField(body, "tasks");
  if (tasks) out.tasks = tasks;

  if (out.action === "create" && !out.tasks) return null;
  return JSON.stringify(out);
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

  const planArgs = parsePlanArguments(body);
  if (planArgs) return planArgs;

  const actionMatch = body.match(/"action"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (actionMatch) {
    const out: Record<string, unknown> = { action: unescapeJsonString(actionMatch[1]!) };
    const urlMatch = body.match(/"url"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (urlMatch) out.url = unescapeJsonString(urlMatch[1]!);
    const selectorMatch = body.match(/"selector"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (selectorMatch) out.selector = unescapeJsonString(selectorMatch[1]!);
    const textMatch = body.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (textMatch) out.text = unescapeJsonString(textMatch[1]!);
    return JSON.stringify(out);
  }

  const nameMatch = body.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (nameMatch) {
    return JSON.stringify({ name: unescapeJsonString(nameMatch[1]!) });
  }

  return null;
}

function pushRecovered(results: ToolCall[], name: string, args: string): void {
  const clean = sanitizeToolName(name);
  if (!clean) return;
  results.push({
    id: `recovered_${Date.now()}_${results.length}`,
    name: clean,
    arguments: args,
  });
}

/** Recover tool calls when Groq/gpt-oss rejects harmony-leaked tool names. */
export function recoverToolCallsFromValidationError(error: string): ToolCall[] {
  const results: ToolCall[] = [];
  const toolMatch = error.match(/attempted to call tool ['"]([^'"]+)['"]/i);
  const failed = extractFailedGeneration(error);

  const tryPush = (rawName: string, args: string) => {
    const name = sanitizeToolName(rawName);
    if (name && args) pushRecovered(results, name, args);
  };

  if (failed) {
    const fromFailed = parseMalformedToolCalls(failed);
    if (fromFailed.length > 0) {
      return fromFailed.map((tc, i) => ({
        id: tc.id?.trim() || `recovered_${Date.now()}_${i}`,
        name: sanitizeToolName(tc.name),
        arguments: tc.arguments?.trim() || "{}",
      })).filter((tc) => tc.name);
    }

    const harmonyMsg = failed.match(/<\|message\|>(\{[\s\S]*?\})<\|/);
    const harmonyName = failed.match(/functions\.([a-zA-Z0-9_]+)/);
    if (harmonyMsg && harmonyName) {
      const args = parseToolArguments(harmonyMsg[1]!);
      if (args) {
        tryPush(harmonyName[1]!, args);
        if (results.length > 0) return results;
      }
    }

    const jsonMatch = failed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let args = parseToolArguments(jsonMatch[0]);
      // Model output is often the full call wrapper {"name": "x", "arguments": {...}} —
      // unwrap it so the tool receives only its arguments.
      if (args) {
        try {
          const parsed = JSON.parse(args) as { name?: unknown; arguments?: unknown };
          if (
            typeof parsed.name === "string" &&
            parsed.arguments !== undefined &&
            typeof parsed.arguments === "object"
          ) {
            args = JSON.stringify(parsed.arguments);
            tryPush(parsed.name, args);
            if (results.length > 0) return results;
          }
        } catch {
          // fall through to the generic path
        }
      }
      if (args && toolMatch) {
        tryPush(toolMatch[1]!, args);
        if (results.length > 0) return results;
      }
    }
  }

  if (toolMatch) {
    const name = sanitizeToolName(toolMatch[1]!);
    if (name) {
      results.push({ id: `recovered_${Date.now()}`, name, arguments: "{}" });
    }
  }

  return results;
}

export function parseMalformedToolCalls(text: string): ToolCall[] {
  const results: ToolCall[] = [];
  if (!text) return results;

  const tryAdd = (name: string, tail: string) => {
    const args = argsFromFunctionTail(tail);
    if (name && args) pushRecovered(results, name, args);
  };

  // Groq: <function=plan,{"action":"create",...}
  const commaJsonRe = /<function=([a-zA-Z0-9_]+)\s*,\s*(\{[\s\S]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = commaJsonRe.exec(text)) !== null) {
    tryAdd(match[1]!.trim(), match[2]!);
  }

  if (results.length === 0) {
    const closedRe = /<function=([a-zA-Z0-9_]+)([\s\S]*?)<\/function>/gi;
    while ((match = closedRe.exec(text)) !== null) {
      tryAdd(match[1]!.trim(), match[2]!);
    }
  }

  if (results.length === 0) {
    const truncatedRe = /<function=([a-zA-Z0-9_]+)([\s\S]+)/gi;
    while ((match = truncatedRe.exec(text)) !== null) {
      tryAdd(match[1]!.trim(), match[2]!);
    }
  }

  if (results.length === 0) {
    const namedTagRe = /<function>([a-zA-Z0-9_]+)(\{[\s\S]*?)<\/function>/gi;
    while ((match = namedTagRe.exec(text)) !== null) {
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

/** Remove text-based tool call markup some models emit instead of structured tool_calls. */
export function stripMalformedToolText(text: string): string {
  return text
    .replace(/<function>[\s\S]*?<\/function>/gi, "")
    .replace(/<function=[\s\S]*?<\/function>/gi, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractFailedGeneration(errorMessage: string): string | null {
  const marker = "Model output:";
  const idx = errorMessage.indexOf(marker);
  if (idx >= 0) return errorMessage.slice(idx + marker.length).trim();

  const groqMatch = errorMessage.match(/failed_generation['":\s]+([\s\S]+)/i);
  if (groqMatch) return groqMatch[1]!.trim();

  return null;
}

/** Strip internal API details before showing errors in the UI. */
export function sanitizeErrorForUser(errorMessage: string): string | null {
  if (
    /Failed to call a function|tool_use_failed|failed_generation|Tool call validation failed/i.test(
      errorMessage,
    )
  ) {
    return null;
  }
  const marker = "Model output:";
  const idx = errorMessage.indexOf(marker);
  const cleaned = (idx >= 0 ? errorMessage.slice(0, idx) : errorMessage).trim();
  if (!cleaned || /Failed to call a function/i.test(cleaned)) return null;
  return cleaned;
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
          toolCalls.set(idx, { id: tc.id ?? "", name: "", arguments: "" });
        }
        const existing = toolCalls.get(idx)!;
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) {
          existing.name = mergeToolNameChunk(existing.name, tc.function.name);
          yield {
            type: "tool_call_delta",
            index: idx,
            id: existing.id,
            name: sanitizeToolName(existing.name),
          };
        }
        if (tc.function?.arguments) {
          existing.arguments += tc.function.arguments;
          yield {
            type: "tool_call_delta",
            index: idx,
            id: existing.id,
            name: sanitizeToolName(existing.name),
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
  if (failed) return `${msg}\nModel output: ${failed}`;
  return msg;
}
