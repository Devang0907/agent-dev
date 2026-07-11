import type { EvalScenario } from "../types.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import { computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const requirementPivot: EvalScenario = {
  id: "requirement-pivot",
  title: "Requirement Pivot",
  tags: ["full"],
  description: "User changes requirements mid-task; agent adapts gracefully",
  rubric: ["ContextRetention", "Execution", "Reasoning"],
  timeoutMs: 180_000,

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(join(ctx.workspace.path, "src/greet.ts"), `export function greet() { return "Hello"; }\n`);
  },

  turns: [
    { prompt: "Add a greet function that returns 'Hello World' in src/greet.ts" },
    { prompt: "Actually, change of plans — make it return 'Hi there' instead. Ignore the Hello World requirement." },
  ],

  async grade(ctx) {
    const content = readWorkspaceFile(ctx.workspace, "src/greet.ts") ?? "";
    const hasHiThere = content.includes("Hi there");
    const checks = [
      { name: "adapted to new requirement", passed: hasHiThere, dimension: "ContextRetention" as const, weight: 2 },
      { name: "file was edited", passed: content.includes("greet"), dimension: "Execution" as const },
    ];
    const rubric = computeRubricFromChecks(["ContextRetention", "Execution", "Reasoning"], checks);
    return { passed: hasHiThere, score: aggregateScore(rubric), rubric, checks };
  },
};
