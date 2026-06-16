import type { ChatMessage, Model, StreamEvent, ToolCall } from "../providers/types.js";
import { streamChat } from "../providers/registry.js";
import type { Settings } from "../config/settings.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";

const DEFAULT_SYSTEM_PROMPT = `You are a helpful coding assistant with access to tools: read, write, edit, and bash.
Use tools to inspect and modify the codebase. Be concise and accurate.
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

  const stream = streamChat(model, {
    messages,
    tools,
    systemPrompt,
    thinkingLevel: settings.thinkingLevel,
    signal,
  });

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

  const toolCalls = Array.from(toolCallMap.values()).filter((tc) => tc.name);
  return { content, toolCalls };
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

  while (true) {
    if (signal?.aborted) break;

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
      onEvent({ type: "error", message: error });
      break;
    }

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
    context.push(assistantMsg);

    if (toolCalls.length === 0) {
      onEvent({ type: "turn_end" });
      break;
    }

    for (const tc of toolCalls) {
      onEvent({ type: "tool_call", toolCall: tc });
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeTool(tc.name, args, workdir);
      onEvent({ type: "tool_result", toolCallId: tc.id, name: tc.name, result });
      context.push({
        role: "tool",
        content: result,
        toolCallId: tc.id,
        name: tc.name,
      });
    }
  }

  return context.slice(messages.length);
}
