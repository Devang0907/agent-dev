import type { EvalScenario } from "../types.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import { computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const taskAbcReturnA: EvalScenario = {
  id: "task-abc-return-a",
  title: "Context Switching A→B→C→A",
  tags: ["full"],
  description: "Switch between tasks and return to complete task A",
  rubric: ["ContextRetention", "Execution"],
  timeoutMs: 300_000,

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(ctx.workspace.path, "task-a.txt"), "TASK_A_MARKER=original\n");
    writeFileSync(join(ctx.workspace.path, "task-b.txt"), "TASK_B_MARKER=pending\n");
    writeFileSync(join(ctx.workspace.path, "task-c.txt"), "TASK_C_MARKER=pending\n");
  },

  turns: [
    { prompt: "Task A: Edit task-a.txt to set TASK_A_MARKER=completed-a" },
    { prompt: "Task B: Edit task-b.txt to set TASK_B_MARKER=completed-b" },
    { prompt: "Task C: Edit task-c.txt to set TASK_C_MARKER=completed-c" },
    { prompt: "Return to Task A: verify task-a.txt says completed-a. If not, fix it." },
  ],

  async grade(ctx) {
    const a = readWorkspaceFile(ctx.workspace, "task-a.txt") ?? "";
    const b = readWorkspaceFile(ctx.workspace, "task-b.txt") ?? "";
    const c = readWorkspaceFile(ctx.workspace, "task-c.txt") ?? "";
    const checks = [
      { name: "task A completed", passed: a.includes("completed-a"), dimension: "Execution" as const, weight: 2 },
      { name: "task B completed", passed: b.includes("completed-b"), dimension: "Execution" as const },
      { name: "task C completed", passed: c.includes("completed-c"), dimension: "Execution" as const },
      { name: "returned to task A", passed: a.includes("completed-a"), dimension: "ContextRetention" as const, weight: 2 },
    ];
    const rubric = computeRubricFromChecks(["ContextRetention", "Execution"], checks);
    const passed = a.includes("completed-a") && b.includes("completed-b");
    return { passed, score: aggregateScore(rubric), rubric, checks };
  },
};
