import type { ToolDefinition, ChatMessage } from "../../../providers/types.js";
import { runAgentLoop } from "../../loop.js";
import type { PermissionRequest, InteractionRequest } from "../../loop.js";
import { buildDefaultSystemPrompt } from "../../system-prompt.js";
import { modelRef } from "../../../config/models.js";
import { createRunId, appendTraceEvent, wrapWorkerEvent } from "../../orchestrator/trace.js";
import { getMultiAgentContext } from "../context.js";
import type { MultiAgentContext } from "../context.js";
import { getAgentProfile, auditFilePath } from "../agents.js";
import type { MultiAgentProfile } from "../agents.js";
import { resolveAgentModel } from "../models.js";
import { normalizeClaimPath } from "../file-claims.js";

const MAX_TASK_SUMMARY_CHARS = 3000;
const MAX_SUMMARY_TOOLS = 20;

export interface SpawnTaskArgs {
  agent: string;
  task: string;
  model?: string;
  files_touched?: string[];
  context?: string;
  success_criteria?: string;
}

export const spawnAgentsTool: ToolDefinition = {
  name: "spawn_agents",
  description:
    "Spawn one or more specialized agents that run IN PARALLEL on the same codebase. Each task gets its own agent, model, and (for writing agents) a disjoint files_touched scope. Returns a combined report when all agents finish.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "One entry per agent to spawn. Independent tasks run concurrently.",
        items: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "Agent id from the catalog (e.g. scout, implementer, reviewer)",
            },
            task: {
              type: "string",
              description: "Narrow task description for this agent",
            },
            model: {
              type: "string",
              description:
                "Optional model ref (provider/id) from the available-models list. Omit to auto-select by effort.",
            },
            files_touched: {
              type: "array",
              items: { type: "string" },
              description:
                "REQUIRED for writing agents (implementer): exact files this agent may create/modify. Must not overlap with other tasks in flight.",
            },
            context: {
              type: "string",
              description: "Optional background context the agent needs",
            },
            success_criteria: {
              type: "string",
              description: "Optional criteria for judging success",
            },
          },
          required: ["agent", "task"],
          additionalProperties: false,
        },
      },
    },
    required: ["tasks"],
    additionalProperties: false,
  },
};

function buildAgentUserMessage(
  args: SpawnTaskArgs,
  profile: MultiAgentProfile,
  sessionId: string,
  runId: string,
): string {
  const parts = [`## Task\n${args.task.trim()}`];
  if (args.context?.trim()) parts.push(`## Context\n${args.context.trim()}`);
  if (args.success_criteria?.trim()) {
    parts.push(`## Success criteria\n${args.success_criteria.trim()}`);
  }
  if (args.files_touched && args.files_touched.length > 0) {
    parts.push(`## Files touched (your ONLY writable scope)\n${args.files_touched.map((f) => `- ${f}`).join("\n")}`);
  }
  if (profile.canWrite) {
    parts.push(`## Audit\nBefore finishing, write your structured audit to \`${auditFilePath(sessionId, runId)}\` starting with a "Files changed" list.`);
  }
  parts.push("\nExecute this task only. Report results concisely when done.");
  return parts.join("\n\n");
}

function extractAgentSummary(messages: ChatMessage[]): {
  summary: string;
  status: "success" | "error" | "aborted";
  toolsUsed: string[];
} {
  const toolsUsed: string[] = [];
  let lastAssistant = "";
  // Only the final tool outcome matters: agents often recover from a failed
  // call by retrying, and that should still count as success.
  let lastToolErrored = false;

  for (const msg of messages) {
    if (msg.role === "tool") {
      if (msg.name && !toolsUsed.includes(msg.name)) toolsUsed.push(msg.name);
      lastToolErrored = msg.content.startsWith("Error:");
    }
    if (msg.role === "assistant" && msg.content.trim()) {
      lastAssistant = msg.content.trim();
    }
  }

  return {
    summary: lastAssistant || "(no summary from agent)",
    status: lastToolErrored ? "error" : "success",
    toolsUsed,
  };
}

interface TaskOutcome {
  runId: string;
  agentId: string;
  modelUsed: string;
  status: "success" | "error" | "aborted";
  summary: string;
  toolsUsed: string[];
  warning?: string;
  auditPath?: string;
}

/** Runs tasks with at most `limit` concurrent executions. */
async function runBounded<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Session-level pending permission/interaction slots hold a single resolver,
 * so concurrent agents must take turns asking the user.
 */
function serialize<Req, Res>(
  handler: ((request: Req) => Promise<Res>) | undefined,
): ((request: Req) => Promise<Res>) | undefined {
  if (!handler) return undefined;
  let queue: Promise<unknown> = Promise.resolve();
  return (request: Req) => {
    const run = queue.then(() => handler(request));
    queue = run.catch(() => undefined);
    return run;
  };
}

function validateTasks(
  tasks: SpawnTaskArgs[],
  ctx: MultiAgentContext,
): string | null {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return "Error: tasks must be a non-empty array.";
  }

  if (ctx.spawnCount + tasks.length > ctx.maxSpawnsPerTurn) {
    return `Error: spawn limit reached (${ctx.maxSpawnsPerTurn} agents per turn). Synthesize results with what you have.`;
  }

  const seenScopes = new Map<string, number>(); // normalized path -> task index
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    if (!t.agent?.trim()) return `Error: tasks[${i}] is missing agent.`;
    if (!t.task?.trim()) return `Error: tasks[${i}] is missing task.`;

    const profile = getAgentProfile(t.agent, ctx.customAgents);
    if (!profile) {
      return `Error: unknown agent "${t.agent}" in tasks[${i}]. Check the agent catalog.`;
    }

    if (profile.canWrite && (!t.files_touched || t.files_touched.length === 0)) {
      return `Error: tasks[${i}] (${profile.id}) writes files and must declare files_touched — the exact files it may create or modify.`;
    }

    for (const path of t.files_touched ?? []) {
      const normalized = normalizeClaimPath(path, ctx.workdir);
      if (!normalized) {
        return `Error: tasks[${i}] declares a file outside the project: "${path}".`;
      }
      const prior = seenScopes.get(normalized);
      if (prior !== undefined && prior !== i) {
        return `Error: file scope conflict — "${path}" appears in both tasks[${prior}] and tasks[${i}]. Parallel agents must have disjoint files_touched scopes.`;
      }
      seenScopes.set(normalized, i);
    }
  }

  return null;
}

export async function executeSpawnAgents(args: { tasks: SpawnTaskArgs[] }): Promise<string> {
  const ctx = getMultiAgentContext();
  if (!ctx) {
    return "Error: spawn_agents is only available in multi-agent orchestrator mode.";
  }

  const tasks = args.tasks;
  const validationError = validateTasks(tasks, ctx);
  if (validationError) return validationError;

  if (ctx.signal?.aborted) {
    return "Error: aborted by user before agents were spawned.";
  }

  ctx.spawnCount += tasks.length;

  const onPermissionRequest = serialize<PermissionRequest, boolean>(ctx.onPermissionRequest);
  const onInteractionRequest = serialize<InteractionRequest, string | null>(
    ctx.onInteractionRequest,
  );
  const loopRunner = ctx.loopRunner ?? runAgentLoop;

  const runners = tasks.map((taskArgs) => async (): Promise<TaskOutcome> => {
    const profile = getAgentProfile(taskArgs.agent, ctx.customAgents)!;
    const runId = createRunId();
    const resolution = resolveAgentModel(
      taskArgs.model,
      profile.effort,
      ctx.settings,
      ctx.bossModel,
    );
    const modelUsed = modelRef(resolution.model);
    const declaredFiles = taskArgs.files_touched ?? [];
    const hasScope = declaredFiles.length > 0;

    if (hasScope) {
      const claimed = ctx.claims.claim(runId, declaredFiles);
      if (!claimed.ok) {
        return {
          runId,
          agentId: profile.id,
          modelUsed,
          status: "error",
          summary: `File scope conflict: "${claimed.conflict.path}" is claimed by live agent run #${claimed.conflict.ownerRunId}. Re-dispatch this task after that run finishes.`,
          toolsUsed: [],
          warning: resolution.warning,
        };
      }
    }

    ctx.onEvent({
      type: "delegation_start",
      runId,
      workerId: profile.id,
      task: taskArgs.task,
      model: modelUsed,
    });
    appendTraceEvent(ctx.sessionId, runId, {
      type: "delegation_start",
      workerId: profile.id,
      payload: {
        task: taskArgs.task,
        context: taskArgs.context,
        success_criteria: taskArgs.success_criteria,
        files_touched: declaredFiles,
        model: modelUsed,
        modelWarning: resolution.warning,
      },
    });

    const toolsUsed: string[] = [];
    let status: "success" | "error" | "aborted" = "success";
    let summary = "";
    let fatalError: string | null = null;

    try {
      const newMessages = await loopRunner({
        model: resolution.model,
        messages: [
          {
            role: "user",
            content: buildAgentUserMessage(taskArgs, profile, ctx.sessionId, runId),
          },
        ],
        settings: ctx.settings,
        workdir: ctx.workdir,
        agentMode: profile.mode,
        systemPrompt:
          buildDefaultSystemPrompt(ctx.workdir, profile.mode) + "\n\n" + profile.systemPrompt,
        allowedTools: profile.tools,
        signal: ctx.signal,
        fileScope: hasScope ? declaredFiles : undefined,
        fileWriteGuard: profile.canWrite
          ? (path) => ctx.claims.checkWrite(runId, path, hasScope)
          : undefined,
        onEvent: (event) => {
          if (event.type === "tool_call" && event.toolCall.name) {
            if (!toolsUsed.includes(event.toolCall.name)) toolsUsed.push(event.toolCall.name);
          }
          // An "error" event is fatal only when the loop stops right after it.
          // If the loop recovers (e.g. model failover), a new round begins and
          // we clear the recorded error.
          if (event.type === "error") {
            fatalError = event.message;
          } else if (event.type === "message_start" || event.type === "turn_end") {
            fatalError = null;
          }
          if (
            event.type === "message_start" ||
            event.type === "text_delta" ||
            event.type === "tool_call" ||
            event.type === "tool_progress" ||
            event.type === "tool_result" ||
            event.type === "turn_end" ||
            event.type === "error"
          ) {
            wrapWorkerEvent(runId, profile.id, event, ctx.onEvent, ctx.sessionId);
          }
        },
        onPermissionRequest: onPermissionRequest
          ? (request) => onPermissionRequest({ ...request, workerId: profile.id, runId })
          : undefined,
        onInteractionRequest,
        sessionId: ctx.sessionId,
      });

      const extracted = extractAgentSummary(newMessages);
      status = ctx.signal?.aborted ? "aborted" : extracted.status;
      summary = extracted.summary;
      for (const t of extracted.toolsUsed) {
        if (!toolsUsed.includes(t)) toolsUsed.push(t);
      }
      if (fatalError && !ctx.signal?.aborted) {
        status = "error";
        summary =
          summary === "(no summary from agent)"
            ? `Agent failed: ${fatalError}`
            : `${summary}\n\nAgent aborted with error: ${fatalError}`;
      }
    } catch (err) {
      status = ctx.signal?.aborted ? "aborted" : "error";
      summary = err instanceof Error ? err.message : String(err);
    } finally {
      if (hasScope) ctx.claims.release(runId);
    }

    ctx.onEvent({
      type: "delegation_end",
      runId,
      workerId: profile.id,
      status,
      summary,
      model: modelUsed,
    });
    appendTraceEvent(ctx.sessionId, runId, {
      type: "delegation_end",
      workerId: profile.id,
      payload: { status, summary, toolsUsed, model: modelUsed },
    });

    return {
      runId,
      agentId: profile.id,
      modelUsed,
      status,
      summary,
      toolsUsed,
      warning: resolution.warning,
      auditPath: profile.canWrite ? auditFilePath(ctx.sessionId, runId) : undefined,
    };
  });

  const outcomes = await runBounded(runners, ctx.maxParallel);

  const lines: string[] = [
    `Spawned ${outcomes.length} agent(s) in parallel (max ${ctx.maxParallel} concurrent):`,
    "",
  ];
  for (const o of outcomes) {
    const truncated =
      o.summary.length > MAX_TASK_SUMMARY_CHARS
        ? o.summary.slice(0, MAX_TASK_SUMMARY_CHARS) + "…"
        : o.summary;
    const toolList = o.toolsUsed.slice(0, MAX_SUMMARY_TOOLS).join(", ") || "none";
    lines.push(`### ${o.agentId} #${o.runId} — ${o.status} (model: ${o.modelUsed})`);
    if (o.warning) lines.push(`Warning: ${o.warning}`);
    lines.push(`Tools used: ${toolList}`);
    if (o.auditPath) lines.push(`Audit: ${o.auditPath}`);
    lines.push("", truncated, "");
  }
  return lines.join("\n").trimEnd();
}
