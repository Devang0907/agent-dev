import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { PLAN_PATH, SESSIONS_DIR } from "../../config/paths.js";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface PlanTask {
  id: string;
  content: string;
  status: TaskStatus;
  assignee?: string;
  parentId?: string;
  runId?: string;
}

interface PlanStore {
  title?: string;
  tasks: PlanTask[];
  updatedAt: string;
}

export function planPathForSession(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.plan.json`);
}

export const planTool: ToolDefinition = {
  name: "plan",
  description:
    "Create and track a task plan for multi-step work. Persists per chat session. Use at the start of complex tasks. Supports assignee, parent_id, and run_id for hierarchical boss orchestration.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "create | list | update | complete | clear",
      },
      title: { type: "string", description: "Plan title (for create)" },
      tasks: {
        type: "array",
        description: "Task strings (for create)",
        items: { type: "string" },
      },
      assignees: {
        type: "array",
        description: "Worker ids parallel to tasks (for create)",
        items: { type: "string" },
      },
      parent_ids: {
        type: "array",
        description: "Parent task ids parallel to tasks (for create)",
        items: { type: "string" },
      },
      task_id: { type: "string", description: "Task id for update/complete" },
      status: {
        type: "string",
        description: "pending | in_progress | completed (for update)",
      },
      assignee: { type: "string", description: "Worker id assigned to task (for update/create)" },
      parent_id: { type: "string", description: "Parent task id (for update)" },
      run_id: { type: "string", description: "Delegation run id linked to task (for update)" },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

function loadPlanAt(path: string): PlanStore | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PlanStore;
  } catch {
    return null;
  }
}

function savePlanAt(path: string, plan: PlanStore): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(plan, null, 2), "utf-8");
}

function loadPlan(sessionId?: string): PlanStore | null {
  if (!sessionId) return null;
  const path = planPathForSession(sessionId);
  const sessionPlan = loadPlanAt(path);
  if (sessionPlan) return sessionPlan;

  // Migrate legacy global plan.json (pre-session-scoped storage) once.
  if (existsSync(PLAN_PATH)) {
    const legacy = loadPlanAt(PLAN_PATH);
    if (legacy && legacy.tasks.length > 0) {
      savePlanAt(path, legacy);
      clearLegacyGlobalPlan();
      return legacy;
    }
  }

  return null;
}

function savePlan(plan: PlanStore, sessionId?: string): void {
  if (!sessionId) return;
  savePlanAt(planPathForSession(sessionId), plan);
}

function formatPlan(plan: PlanStore): string {
  const lines: string[] = [];
  if (plan.title) lines.push(`Plan: ${plan.title}`);
  if (plan.tasks.length === 0) {
    lines.push("(no tasks)");
    return lines.join("\n");
  }
  for (const t of plan.tasks) {
    const mark =
      t.status === "completed" ? "✓" : t.status === "in_progress" ? "→" : "○";
    const meta: string[] = [];
    if (t.assignee) meta.push(t.assignee);
    if (t.parentId) meta.push(`parent:${t.parentId}`);
    if (t.runId) meta.push(`run:${t.runId}`);
    const suffix = meta.length > 0 ? ` (${meta.join(", ")})` : "";
    lines.push(`${mark} [${t.id}] ${t.content}${suffix}`);
  }
  return lines.join("\n");
}

/** Remove the legacy global plan file from before session-scoped plans. */
export function clearLegacyGlobalPlan(): void {
  if (existsSync(PLAN_PATH)) {
    try {
      unlinkSync(PLAN_PATH);
    } catch {
      // ignore
    }
  }
}

export function clearPlan(sessionId: string): void {
  const path = planPathForSession(sessionId);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      savePlanAt(path, { tasks: [], updatedAt: new Date().toISOString() });
    }
  }
  clearLegacyGlobalPlan();
}

export async function executePlan(
  args: {
    action: string;
    title?: string;
    tasks?: string[];
    assignees?: string[];
    parent_ids?: string[];
    task_id?: string;
    status?: string;
    assignee?: string;
    parent_id?: string;
    run_id?: string;
  },
  sessionId?: string,
): Promise<string> {
  const action = args.action?.trim().toLowerCase();
  if (!action) return "Error: action is required";
  if (!sessionId) return "Error: no active session for plan storage";

  if (action === "clear") {
    clearPlan(sessionId);
    return "Plan cleared.";
  }

  if (action === "create") {
    const tasks = (args.tasks ?? []).filter((t) => t.trim());
    if (tasks.length === 0) return "Error: tasks array is required for create";
    const assignees = args.assignees ?? [];
    const parentIds = args.parent_ids ?? [];
    const plan: PlanStore = {
      title: args.title?.trim(),
      tasks: tasks.map((content, i) => ({
        id: String(i + 1),
        content: content.trim(),
        status: i === 0 ? "in_progress" : "pending",
        assignee: assignees[i]?.trim() || undefined,
        parentId: parentIds[i]?.trim() || undefined,
      })),
      updatedAt: new Date().toISOString(),
    };
    savePlan(plan, sessionId);
    clearLegacyGlobalPlan();
    return `Plan created.\n${formatPlan(plan)}`;
  }

  const plan = loadPlan(sessionId);
  if (!plan || plan.tasks.length === 0) return "No active plan. Use action create first.";

  if (action === "list") {
    return formatPlan(plan);
  }

  const taskId = args.task_id?.trim();
  if (!taskId) return "Error: task_id is required";

  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return `Error: task "${taskId}" not found`;

  if (action === "complete") {
    task.status = "completed";
    const next = plan.tasks.find((t) => t.status === "pending");
    if (next) next.status = "in_progress";
    plan.updatedAt = new Date().toISOString();
    savePlan(plan, sessionId);
    return `Task ${taskId} completed.\n${formatPlan(plan)}`;
  }

  if (action === "update") {
    const status = args.status?.trim().toLowerCase() as TaskStatus | undefined;
    if (status && ["pending", "in_progress", "completed"].includes(status)) {
      if (status === "in_progress") {
        for (const t of plan.tasks) {
          if (t.status === "in_progress" && t.id !== taskId) t.status = "pending";
        }
      }
      task.status = status;
    }
    if (args.assignee?.trim()) task.assignee = args.assignee.trim();
    if (args.parent_id?.trim()) task.parentId = args.parent_id.trim();
    if (args.run_id?.trim()) task.runId = args.run_id.trim();
    plan.updatedAt = new Date().toISOString();
    savePlan(plan, sessionId);
    return `Task ${taskId} updated.\n${formatPlan(plan)}`;
  }

  return `Error: unknown action "${action}". Use create, list, update, complete, or clear.`;
}

export function loadPlanSummary(sessionId?: string): string {
  if (!sessionId) return "";
  const plan = loadPlan(sessionId);
  if (!plan || plan.tasks.length === 0) return "";
  return formatPlan(plan);
}
