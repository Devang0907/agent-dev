import {
  normalizeToolCalls,
  parseMalformedToolCalls,
  extractFailedGeneration,
} from "../providers/openai-compat.js";
import { streamChat } from "../providers/registry.js";
import type { ChatMessage, Model, ToolCall } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { getToolDefinitions, executeTool, PERMISSION_REQUIRED_TOOLS } from "./tools/index.js";
import { getPlatformContext } from "./platform.js";

export interface PermissionRequest {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  command: string;
}

const MAX_TOOL_ROUNDS = 6;
const MAX_SAME_TOOL_CALLS = 2;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful coding assistant with access to tools: read, write, edit, bash, and web_search.
When the user asks you to create or modify files, call write or edit once with the full file content, then reply briefly to confirm.
Use web_search for news and current events. When headlines are returned, list them as a numbered list using the exact titles — do not give vague category summaries.
Shell commands via bash require user approval. Dev servers (npm run dev, npm start) run in the background and return a URL.
Do NOT call the same tool repeatedly with the same arguments. One successful write is enough.
When calling tools, use the function-calling API with valid JSON arguments only (e.g. web_search: {"query": "search terms"}).

${getPlatformContext()}`;

function systemPromptForModel(model: Model, base = DEFAULT_SYSTEM_PROMPT): string {
  if (model.provider === "groq") {
    return `${base}\nFor Groq: never output <function=...> text — use structured tool calls with JSON arguments.`;
  }
  return base;
}

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
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>;
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

function resolveToolCalls(content: string, toolCalls: ToolCall[], error?: string): ToolCall[] {
  const normalized = dedupeToolCalls(normalizeToolCalls(toolCalls.filter((tc) => tc.name)));
  if (normalized.length > 0) return normalized;

  const fromContent = dedupeToolCalls(normalizeToolCalls(parseMalformedToolCalls(content)));
  if (fromContent.length > 0) return fromContent;

  if (error) {
    const failed = extractFailedGeneration(error);
    if (failed) {
      return dedupeToolCalls(normalizeToolCalls(parseMalformedToolCalls(failed)));
    }
  }

  return [];
}

async function runToolBatch(
  uniqueCalls: ToolCall[],
  context: ChatMessage[],
  workdir: string,
  callCounts: Map<string, number>,
  onEvent: (event: AgentEvent) => void,
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>,
): Promise<boolean> {
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

    let result: string;
    const needsPermission = PERMISSION_REQUIRED_TOOLS.has(tc.name);

    if (needsPermission && onPermissionRequest) {
      const approved = await onPermissionRequest({
        toolCallId: tc.id,
        name: tc.name,
        args,
        command: String(args.command ?? ""),
      });
      result = approved
        ? await executeTool(tc.name, args, workdir)
        : "Command execution denied by user.";
    } else if (needsPermission) {
      result = "Command execution denied — permission handler not available.";
    } else {
      result = await executeTool(tc.name, args, workdir);
    }

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

  return stopAfterBatch;
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
      return { content, toolCalls: Array.from(toolCallMap.values()), error: event.message };
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
    onPermissionRequest,
  } = options;

  const context = [...messages];
  const callCounts = new Map<string, number>();
  const effectivePrompt = systemPromptForModel(model, systemPrompt);
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
      effectivePrompt,
      signal,
      onEvent,
    );

    const uniqueCalls = resolveToolCalls(content, toolCalls, error);

    if (error && uniqueCalls.length === 0) {
      if (isToolUseFailedError(error) && hadSuccessfulToolResults(context)) {
        finishGracefully(context, content, onEvent);
        break;
      }
      onEvent({ type: "error", message: error });
      break;
    }

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: error ? "" : content,
      toolCalls: uniqueCalls.length > 0 ? uniqueCalls : undefined,
    };
    context.push(assistantMsg);

    if (uniqueCalls.length === 0) {
      if (error) {
        onEvent({ type: "error", message: error });
      } else {
        onEvent({ type: "turn_end" });
      }
      break;
    }

    const stopAfterBatch = await runToolBatch(
      uniqueCalls,
      context,
      workdir,
      callCounts,
      onEvent,
      onPermissionRequest,
    );

    if (stopAfterBatch) {
      finishGracefully(context, content, onEvent);
      break;
    }
  }

  return context.slice(messages.length);
}
