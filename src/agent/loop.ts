import {
  normalizeToolCalls,
  parseMalformedToolCalls,
  extractFailedGeneration,
  sanitizeErrorForUser,
  stripMalformedToolText,
  recoverToolCallsFromValidationError,
} from "../providers/openai-compat.js";
import { streamChat } from "../providers/registry.js";
import type { ChatMessage, Model, ToolCall } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { getToolDefinitions, executeTool, needsToolPermission, formatPermissionCommand, checkPlanModeToolBlock } from "./tools/index.js";
import { setSkillContext } from "./skills.js";
import { setBrowserContext } from "./tools/browser-context.js";
import type { AgentMode } from "./mode.js";
import {
  buildDefaultSystemPrompt,
  buildSystemPrompt,
  systemPromptForModel,
} from "./system-prompt.js";

export interface InteractionRequest {
  toolCallId: string;
  kind: "manual_step" | "user_input";
  reason: string;
  placeholder?: string;
}

export interface PermissionRequest {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  command: string;
  workerId?: string;
  runId?: string;
}

const MAX_TOOL_ROUNDS = Number(process.env.AGENT_MAX_TOOL_ROUNDS) || 50;
const MAX_SAME_TOOL_CALLS = 2;
const MAX_BROWSER_SAME_TOOL_CALLS = 10;

const DEFAULT_SYSTEM_PROMPT = buildDefaultSystemPrompt();

export type CoreAgentEvent =
  | { type: "message_start"; role: "assistant" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_progress"; toolCallId: string; name: string; message: string }
  | { type: "tool_result"; toolCallId: string; name: string; result: string }
  | { type: "turn_end" }
  | { type: "error"; message: string };

export type OrchestratorEvent =
  | { type: "delegation_start"; runId: string; workerId: string; task: string }
  | {
      type: "delegation_end";
      runId: string;
      workerId: string;
      status: "success" | "error" | "aborted";
      summary: string;
    }
  | { type: "agent_event"; runId: string; workerId: string; event: CoreAgentEvent };

export type AgentEvent = CoreAgentEvent | OrchestratorEvent;

export interface AgentLoopOptions {
  model: Model;
  messages: ChatMessage[];
  settings: Settings;
  workdir: string;
  agentMode?: AgentMode;
  modeSwitchNote?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>;
  onInteractionRequest?: (request: InteractionRequest) => Promise<string | null>;
  sessionId?: string;
}

function isToolUseFailedError(message: string): boolean {
  return /Failed to call a function|tool_use_failed|failed_generation|Tool call validation failed/i.test(
    message,
  );
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
      const fromFailed = dedupeToolCalls(normalizeToolCalls(parseMalformedToolCalls(failed)));
      if (fromFailed.length > 0) return fromFailed;
    }
    const fromError = dedupeToolCalls(normalizeToolCalls(parseMalformedToolCalls(error)));
    if (fromError.length > 0) return fromError;

    const fromValidation = dedupeToolCalls(recoverToolCallsFromValidationError(error));
    if (fromValidation.length > 0) return fromValidation;
  }

  return [];
}

async function runToolBatch(
  uniqueCalls: ToolCall[],
  context: ChatMessage[],
  workdir: string,
  agentMode: AgentMode,
  callCounts: Map<string, number>,
  onEvent: (event: AgentEvent) => void,
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>,
  onInteractionRequest?: (request: InteractionRequest) => Promise<string | null>,
  sessionId?: string,
  settings?: Settings,
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

    const planBlock = checkPlanModeToolBlock(agentMode, tc.name, args, workdir);
    if (planBlock) {
      onEvent({ type: "tool_result", toolCallId: tc.id, name: tc.name, result: planBlock });
      context.push({ role: "tool", content: planBlock, toolCallId: tc.id, name: tc.name });
      continue;
    }

    const sig = toolSignature(tc.name, args);
    const prev = callCounts.get(sig) ?? 0;
    callCounts.set(sig, prev + 1);

    const maxRepeats = tc.name === "browser" ? MAX_BROWSER_SAME_TOOL_CALLS : MAX_SAME_TOOL_CALLS;
    if (prev >= maxRepeats) {
      const skip = "Skipped — already executed this action too many times. Try a different browser action or selector.";
      onEvent({ type: "tool_result", toolCallId: tc.id, name: tc.name, result: skip });
      context.push({ role: "tool", content: skip, toolCallId: tc.id, name: tc.name });
      if (tc.name !== "browser") {
        stopAfterBatch = true;
      }
      continue;
    }

    let result: string;
    const needsPermission = needsToolPermission(tc.name, args);

    const runExecute = async (): Promise<string> => {
      if (tc.name === "browser" && sessionId) {
        setBrowserContext({
          sessionId,
          toolCallId: tc.id,
          settings: settings?.browser ?? {},
          onProgress: (message) => {
            onEvent({ type: "tool_progress", toolCallId: tc.id, name: tc.name, message });
          },
          requestUserStep: async (reason) => {
            if (onInteractionRequest) {
              await onInteractionRequest({
                toolCallId: tc.id,
                kind: "manual_step",
                reason,
              });
            }
          },
          requestUserInput: async (reason, placeholder) => {
            if (!onInteractionRequest) return null;
            return onInteractionRequest({
              toolCallId: tc.id,
              kind: "user_input",
              reason,
              placeholder,
            });
          },
        });
        try {
          return await executeTool(tc.name, args, workdir);
        } finally {
          setBrowserContext(null);
        }
      }
      return executeTool(tc.name, args, workdir);
    };

    if (needsPermission && onPermissionRequest) {
      const approved = await onPermissionRequest({
        toolCallId: tc.id,
        name: tc.name,
        args,
        command: formatPermissionCommand(tc.name, args),
      });
      result = approved ? await runExecute() : "Command execution denied by user.";
    } else if (needsPermission) {
      result = "Command execution denied — permission handler not available.";
    } else {
      result = await runExecute();
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
  agentMode: AgentMode,
  allowedTools?: string[],
  signal?: AbortSignal,
  onEvent?: (event: AgentEvent) => void,
): Promise<{ content: string; toolCalls: ToolCall[]; error?: string }> {
  const tools = getToolDefinitions(agentMode, allowedTools);
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

function lastToolResult(context: ChatMessage[]): string | undefined {
  for (let i = context.length - 1; i >= 0; i--) {
    const msg = context[i];
    if (msg?.role === "tool" && msg.content.trim()) {
      return msg.content.trim();
    }
  }
  return undefined;
}

function finishGracefully(
  context: ChatMessage[],
  content: string,
  onEvent: (event: AgentEvent) => void,
): void {
  const stripped = stripMalformedToolText(content);
  const msg =
    stripped ||
    lastToolResult(context) ||
    "Done — changes saved successfully.";
  onEvent({ type: "text_delta", delta: msg });
  context.push({ role: "assistant", content: msg });
  onEvent({ type: "turn_end" });
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<ChatMessage[]> {
  const {
    model,
    messages,
    settings,
    workdir,
    agentMode = settings.agentMode ?? "build",
    modeSwitchNote,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    allowedTools,
    signal,
    onEvent,
    onPermissionRequest,
    onInteractionRequest,
    sessionId,
  } = options;

  const context = [...messages];
  const callCounts = new Map<string, number>();
  setSkillContext({ workdir, settings });
  try {
  let effectivePrompt = systemPromptForModel(
    model,
    buildSystemPrompt(workdir, { ...settings, agentMode }, systemPrompt),
  );
  if (modeSwitchNote) {
    effectivePrompt += `\n\n${modeSwitchNote}`;
  }
  let toolRound = 0;
  let malformedToolRetry = false;

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
      agentMode,
      allowedTools,
      signal,
      onEvent,
    );

    const uniqueCalls = resolveToolCalls(content, toolCalls, error);

    if (error && uniqueCalls.length === 0) {
      if (isToolUseFailedError(error) && hadSuccessfulToolResults(context)) {
        finishGracefully(context, content, onEvent);
        break;
      }
      if (isToolUseFailedError(error) && !malformedToolRetry) {
        malformedToolRetry = true;
        effectivePrompt +=
          "\n\nIMPORTANT: Your last output used invalid <function=...> text. Use structured tool_calls with valid JSON only. Retry the user's request now.";
        continue;
      }
      if (isToolUseFailedError(error)) {
        finishGracefully(context, "Please try your request again.", onEvent);
        break;
      }
      const userError = sanitizeErrorForUser(error);
      if (userError) onEvent({ type: "error", message: userError });
      break;
    }

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: error ? "" : content,
      toolCalls: uniqueCalls.length > 0 ? uniqueCalls : undefined,
    };
    context.push(assistantMsg);

    if (uniqueCalls.length === 0) {
      const userError = error ? sanitizeErrorForUser(error) : null;
      if (userError) {
        onEvent({ type: "error", message: userError });
      } else {
        onEvent({ type: "turn_end" });
      }
      break;
    }

    const stopAfterBatch = await runToolBatch(
      uniqueCalls,
      context,
      workdir,
      agentMode,
      callCounts,
      onEvent,
      onPermissionRequest,
      onInteractionRequest,
      sessionId,
      settings,
    );

    if (stopAfterBatch) {
      finishGracefully(context, content, onEvent);
      break;
    }
  }

  return context.slice(messages.length);
  } finally {
    setSkillContext(null);
  }
}
