import type { ToolDefinition } from "../../providers/types.js";
import type { ChatMessage } from "../../providers/types.js";
import { runAgentLoop } from "../loop.js";
import { getWorkerProfile } from "../orchestrator/workers.js";
import {
  getDelegationContext,
  incrementDelegationCount,
} from "../orchestrator/context.js";
import { createRunId, appendTraceEvent, wrapWorkerEvent } from "../orchestrator/trace.js";
import { buildDefaultSystemPrompt } from "../system-prompt.js";

const MAX_RESULT_CHARS = 4000;
const MAX_SUMMARY_TOOLS = 20;

export const delegateTool: ToolDefinition = {
  name: "delegate",
  description:
    "Delegate a focused subtask to a specialized worker agent. Workers run in isolation with their own tools. Returns a structured summary when complete.",
  parameters: {
    type: "object",
    properties: {
      worker: {
        type: "string",
        description: "Worker id: explore | implement | shell | plan",
      },
      task: {
        type: "string",
        description: "Narrow task description for the worker",
      },
      context: {
        type: "string",
        description: "Optional background context the worker needs",
      },
      success_criteria: {
        type: "string",
        description: "Optional criteria for judging success",
      },
    },
    required: ["worker", "task"],
    additionalProperties: false,
  },
};

function buildWorkerUserMessage(args: {
  task: string;
  context?: string;
  success_criteria?: string;
}): string {
  const parts = [`## Task\n${args.task.trim()}`];
  if (args.context?.trim()) parts.push(`## Context\n${args.context.trim()}`);
  if (args.success_criteria?.trim()) {
    parts.push(`## Success criteria\n${args.success_criteria.trim()}`);
  }
  parts.push("\nExecute this task only. Report results concisely when done.");
  return parts.join("\n\n");
}

function extractWorkerSummary(messages: ChatMessage[]): {
  summary: string;
  status: "success" | "error" | "aborted";
  toolsUsed: string[];
} {
  const toolsUsed: string[] = [];
  let lastAssistant = "";
  let hasError = false;

  for (const msg of messages) {
    if (msg.role === "tool") {
      if (msg.name && !toolsUsed.includes(msg.name)) toolsUsed.push(msg.name);
      if (msg.content.startsWith("Error:")) hasError = true;
    }
    if (msg.role === "assistant" && msg.content.trim()) {
      lastAssistant = msg.content.trim();
    }
  }

  const status = hasError ? "error" : "success";
  return { summary: lastAssistant || "(no summary from worker)", status, toolsUsed };
}

function formatDelegateResult(
  runId: string,
  workerId: string,
  status: "success" | "error" | "aborted",
  summary: string,
  toolsUsed: string[],
): string {
  const toolList = toolsUsed.slice(0, MAX_SUMMARY_TOOLS).join(", ") || "none";
  const truncated =
    summary.length > MAX_RESULT_CHARS ? summary.slice(0, MAX_RESULT_CHARS) + "…" : summary;
  return [
    `Delegation ${runId} (${workerId}): ${status}`,
    `Tools used: ${toolList}`,
    "",
    truncated,
  ].join("\n");
}

export async function executeDelegate(args: {
  worker: string;
  task: string;
  context?: string;
  success_criteria?: string;
}): Promise<string> {
  const ctx = getDelegationContext();
  if (!ctx) {
    return "Error: delegate is only available in boss orchestrator mode.";
  }

  const workerId = args.worker?.trim().toLowerCase();
  const task = args.task?.trim();
  if (!workerId) return "Error: worker is required";
  if (!task) return "Error: task is required";

  const profile = getWorkerProfile(workerId);
  if (!profile) {
    return `Error: unknown worker "${workerId}". Use: explore, implement, shell, or plan.`;
  }

  const count = incrementDelegationCount();
  if (count > ctx.maxDelegations) {
    return `Error: delegation limit reached (${ctx.maxDelegations} per turn). Synthesize results with what you have.`;
  }

  const runId = createRunId();

  ctx.onEvent({ type: "delegation_start", runId, workerId, task });
  appendTraceEvent(ctx.sessionId, runId, {
    type: "delegation_start",
    workerId,
    payload: { task, context: args.context, success_criteria: args.success_criteria },
  });

  if (ctx.signal?.aborted) {
    const status = "aborted" as const;
    ctx.onEvent({ type: "delegation_end", runId, workerId, status, summary: "Aborted" });
    return formatDelegateResult(runId, workerId, status, "Aborted by user.", []);
  }

  const workerMessages: ChatMessage[] = [
    { role: "user", content: buildWorkerUserMessage(args) },
  ];

  const toolsUsed: string[] = [];
  let status: "success" | "error" | "aborted" = "success";

  try {
    const newMessages = await runAgentLoop({
      model: ctx.model,
      messages: workerMessages,
      settings: ctx.settings,
      workdir: ctx.workdir,
      agentMode: profile.mode,
      systemPrompt: buildDefaultSystemPrompt(ctx.workdir, profile.mode) + "\n\n" + profile.systemPrompt,
      allowedTools: profile.tools,
      signal: ctx.signal,
      onEvent: (event) => {
        if (event.type === "tool_call" && event.toolCall.name) {
          if (!toolsUsed.includes(event.toolCall.name)) toolsUsed.push(event.toolCall.name);
        }
        if (
          event.type === "message_start" ||
          event.type === "text_delta" ||
          event.type === "tool_call" ||
          event.type === "tool_result" ||
          event.type === "turn_end" ||
          event.type === "error"
        ) {
          wrapWorkerEvent(runId, workerId, event, ctx.onEvent, ctx.sessionId);
        }
      },
      onPermissionRequest: ctx.onPermissionRequest
        ? (request) =>
            ctx.onPermissionRequest!({
              ...request,
              workerId,
              runId,
            })
        : undefined,
    });

    const extracted = extractWorkerSummary(newMessages);
    status = extracted.status;
    for (const t of extracted.toolsUsed) {
      if (!toolsUsed.includes(t)) toolsUsed.push(t);
    }

    const summary = extracted.summary;
    ctx.onEvent({ type: "delegation_end", runId, workerId, status, summary });
    appendTraceEvent(ctx.sessionId, runId, {
      type: "delegation_end",
      workerId,
      payload: { status, summary, toolsUsed },
    });

    return formatDelegateResult(runId, workerId, status, summary, toolsUsed);
  } catch (err) {
    status = ctx.signal?.aborted ? "aborted" : "error";
    const msg = err instanceof Error ? err.message : String(err);
    ctx.onEvent({ type: "delegation_end", runId, workerId, status, summary: msg });
    appendTraceEvent(ctx.sessionId, runId, {
      type: "delegation_end",
      workerId,
      payload: { status, summary: msg, toolsUsed },
    });
    return formatDelegateResult(runId, workerId, status, msg, toolsUsed);
  }
}
