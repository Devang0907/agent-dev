import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { PLAN_PATH } from "../../config/paths.js";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface PlanTask {
  id: string;
  content: string;
  status: TaskStatus;
}

interface PlanStore {
  title?: string;
  tasks: PlanTask[];
  updatedAt: string;
}

export const planTool: ToolDefinition = {
  name: "plan",
  description:
    "Create and track a task plan for multi-step work. Persists to ~/.agent-dev/plan.json. Use at the start of complex tasks.",
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
        description: "Task strings (for create) or task updates",
        items: { type: "string" },
      },
      task_id: { type: "string", description: "Task id for update/complete" },
      status: {
        type: "string",
        description: "pending | in_progress | completed (for update)",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

function loadPlan(): PlanStore | null {
  if (!existsSync(PLAN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PLAN_PATH, "utf-8")) as PlanStore;
  } catch {
    return null;
  }
}

function savePlan(plan: PlanStore): void {
  mkdirSync(dirname(PLAN_PATH), { recursive: true });
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2), "utf-8");
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
    lines.push(`${mark} [${t.id}] ${t.content}`);
  }
  return lines.join("\n");
}

export async function executePlan(args: {
  action: string;
  title?: string;
  tasks?: string[];
  task_id?: string;
  status?: string;
}): Promise<string> {
  const action = args.action?.trim().toLowerCase();
  if (!action) return "Error: action is required";

  if (action === "clear") {
    savePlan({ tasks: [], updatedAt: new Date().toISOString() });
    return "Plan cleared.";
  }

  if (action === "create") {
    const tasks = (args.tasks ?? []).filter((t) => t.trim());
    if (tasks.length === 0) return "Error: tasks array is required for create";
    const plan: PlanStore = {
      title: args.title?.trim(),
      tasks: tasks.map((content, i) => ({
        id: String(i + 1),
        content: content.trim(),
        status: i === 0 ? "in_progress" : "pending",
      })),
      updatedAt: new Date().toISOString(),
    };
    savePlan(plan);
    return `Plan created.\n${formatPlan(plan)}`;
  }

  const plan = loadPlan();
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
    savePlan(plan);
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
    plan.updatedAt = new Date().toISOString();
    savePlan(plan);
    return `Task ${taskId} updated.\n${formatPlan(plan)}`;
  }

  return `Error: unknown action "${action}". Use create, list, update, complete, or clear.`;
}

export function loadPlanSummary(): string {
  const plan = loadPlan();
  if (!plan || plan.tasks.length === 0) return "";
  return formatPlan(plan);
}
