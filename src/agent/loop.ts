import { normalizeToolCalls } from "../providers/openai-compat.js";
import { streamChat } from "../providers/registry.js";
import type { ChatMessage, Model, StreamEvent, ToolCall } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";

const MAX_TOOL_ROUNDS = 6;
const MAX_SAME_TOOL_CALLS = 2;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful coding assistant with access to tools: read, write, edit, and bash.
When the user asks you to create or modify files, call write or edit once with the full file content, then reply briefly to confirm.
Do NOT call the same tool repeatedly with the same arguments. One successful write is enough.
Working directory: ${process.cwd()}`;

export type AgentEvent =
  | { type: "message_start"; role: "assistant" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; name: string; result: string }
  | { type: "turn_end" }
  | { type: "error"; message: string };

export interface AgentLoopOptions {
  model: Model;
  messages: ChatMessage[];
  settings: Settings;
  workdir: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

function isToolUseFailedError(message: string): boolean {
  return /Failed to call a function|tool_use_failed|failed_generation/i.test(message);
}

function hadSuccessfulToolResults(context: ChatMessage[]): boolean {
  return context.some(
    (m) => m.role === "tool" && m.content.length > 0 && !m.content.startsWith("Error:"),
  );
}

function toolSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function dedupeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return toolCalls.filter((tc) => {
    const key = `${tc.name}:${tc.arguments}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectStream(
  model: Model,
  messages: ChatMessage[],
  settings: Settings,
  systemPrompt: string,
  signal?: AbortSignal,
  onEvent?: (event: AgentEvent) => void,
): Promise<{ content: string; toolCalls: ToolCall[]; error?: string }> {
  const tools = getToolDefinitions();
  let content = "";
  const toolCallMap: Map<number, ToolCall> = new Map();

  const stream = streamChat(
    model,
    {
      messages,
      tools,
      systemPrompt,
      thinkingLevel: settings.thinkingLevel,
      signal,
    },
    settings,
  );

  for await (const event of stream) {
    if (event.type === "text_delta") {
      content += event.delta;
      onEvent?.({ type: "text_delta", delta: event.delta });
    } else if (event.type === "tool_call_delta") {
      if (!toolCallMap.has(event.index)) {
        toolCallMap.set(event.index, { id: event.id ?? "", name: event.name ?? "", arguments: "" });
      }
      const tc = toolCallMap.get(event.index)!;
      if (event.id) tc.id = event.id;
      if (event.name) tc.name = event.name;
      if (event.argumentsDelta) tc.arguments += event.argumentsDelta;
    } else if (event.type === "error") {
      return { content, toolCalls: [], error: event.message };
    }
  }

  const toolCalls = normalizeToolCalls(Array.from(toolCallMap.values()).filter((tc) => tc.name));
  return { content, toolCalls };
}

function finishGracefully(
  context: ChatMessage[],
  content: string,
  onEvent: (event: AgentEvent) => void,
): void {
  const msg = content.trim() || "Done — changes saved successfully.";
  if (!content.trim()) {
    onEvent({ type: "text_delta", delta: msg });
  }
  context.push({ role: "assistant", content: msg });
  onEvent({ type: "turn_end" });
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<ChatMessage[]> {
  const {
    model,
    messages,
    settings,
    workdir,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    signal,
    onEvent,
  } = options;

  const context = [...messages];
  const callCounts = new Map<string, number>();
  let toolRound = 0;

  while (true) {
    if (signal?.aborted) break;

    toolRound++;
    if (toolRound > MAX_TOOL_ROUNDS) {
      finishGracefully(context, "Done — stopped after too many tool calls.", onEvent);
      break;
    }

    onEvent({ type: "message_start", role: "assistant" });

    const { content, toolCalls, error } = await collectStream(
      model,
      context,
      settings,
      systemPrompt,
      signal,
      onEvent,
    );

    if (error) {
      if (isToolUseFailedError(error) && hadSuccessfulToolResults(context)) {
        finishGracefully(context, content, onEvent);
        break;
      }
      onEvent({ type: "error", message: error });
      break;
    }

    const uniqueCalls = dedupeToolCalls(toolCalls);

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content,
      toolCalls: uniqueCalls.length > 0 ? uniqueCalls : undefined,
    };
    context.push(assistantMsg);

    if (uniqueCalls.length === 0) {
      onEvent({ type: "turn_end" });
      break;
    }

    let stopAfterBatch = false;

    for (const tc of uniqueCalls) {
      onEvent({ type: "tool_call", toolCall: tc });
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {
        args = {};
      }

      const sig = toolSignature(tc.name, args);
      const prev = callCounts.get(sig) ?? 0;
      callCounts.set(sig, prev + 1);

      if (prev >= MAX_SAME_TOOL_CALLS) {
        const skip = "Skipped — already executed this action.";
        onEvent({ type: "tool_result", toolCallId: tc.id, name: tc.name, result: skip });
        context.push({ role: "tool", content: skip, toolCallId: tc.id, name: tc.name });
        stopAfterBatch = true;
        continue;
      }

      const result = await executeTool(tc.name, args, workdir);
      onEvent({ type: "tool_result", toolCallId: tc.id, name: tc.name, result });
      context.push({
        role: "tool",
        content: result,
        toolCallId: tc.id,
        name: tc.name,
      });

      if (!result.startsWith("Error:") && (tc.name === "write" || tc.name === "edit")) {
        stopAfterBatch = true;
      }
    }

    if (stopAfterBatch) {
      finishGracefully(context, content, onEvent);
      break;
    }
  }

  return context.slice(messages.length);
}
