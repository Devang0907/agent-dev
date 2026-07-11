import type { EvalScenario } from "../types.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const planReviseAbandon: EvalScenario = {
  id: "plan-revise-abandon",
  title: "Plan Revise and Abandon",
  tags: ["full"],
  description: "Agent revises plan when user corrects approach",
  rubric: ["Planning", "Reasoning"],
  timeoutMs: 300_000,
  modes: ["plan"],

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(join(ctx.workspace.path, "src/app.ts"), "export const app = 'v1';\n");
  },

  turns: [
    { prompt: "Create a plan to rewrite the entire app in Rust." },
    { prompt: "Actually, we only need to add a logging feature to the existing TypeScript app. Revise the plan." },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const usedPlan = calls.some((c) => c.name === "plan");
    const revised = calls.filter((c) => c.name === "plan").length >= 2 || ctx.metrics.planUpdates >= 2;
    const checks = [
      { name: "used plan tool", passed: usedPlan, dimension: "Planning" as const, weight: 2 },
      { name: "revised plan after correction", passed: revised, dimension: "Planning" as const, weight: 2 },
    ];
    const rubric = computeRubricFromChecks(["Planning", "Reasoning"], checks);
    return { passed: usedPlan, score: aggregateScore(rubric), rubric, checks };
  },
};
