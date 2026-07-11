import type { EvalScenario } from "../types.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const minimalDiffFix: EvalScenario = {
  id: "minimal-diff-fix",
  title: "Minimal Diff Fix",
  tags: ["full"],
  description: "Bug fix with minimal edits preserving style",
  rubric: ["Execution", "Reasoning"],
  timeoutMs: 120_000,

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(
      join(ctx.workspace.path, "src/calc.ts"),
      `export function multiply(a: number, b: number): number {
  // multiply two numbers
  return a + b;
}
`,
    );
  },

  turns: [{ prompt: "Fix the bug in src/calc.ts — multiply should use * not +. Make a minimal edit only." }],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const content = readWorkspaceFile(ctx.workspace, "src/calc.ts") ?? "";
    const fixed = content.includes("a * b");
    const usedEdit = calls.some((c) => c.name === "edit");
    const preservedComment = content.includes("// multiply two numbers");
    const checks = [
      { name: "fixed bug", passed: fixed, dimension: "Execution" as const, weight: 2 },
      { name: "used edit not rewrite", passed: usedEdit, dimension: "Execution" as const },
      { name: "preserved style", passed: preservedComment, dimension: "Reasoning" as const },
    ];
    const rubric = computeRubricFromChecks(["Execution", "Reasoning"], checks);
    return { passed: fixed, score: aggregateScore(rubric), rubric, checks };
  },
};
