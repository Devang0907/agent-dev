import type { EvalScenario } from "../types.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const manyToolCalls: EvalScenario = {
  id: "many-tool-calls",
  title: "Long-Running Multi-File Task",
  tags: ["full"],
  description: "Complex task requiring many tool calls with consistency",
  rubric: ["Execution", "Planning", "Recovery"],
  timeoutMs: 600_000,

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (let i = 0; i < 5; i++) {
      mkdirSync(join(ctx.workspace.path, `module${i}`), { recursive: true });
      writeFileSync(join(ctx.workspace.path, `module${i}`, `index.ts`), `export const v${i} = ${i};\n`);
    }
  },

  turns: [
    {
      prompt:
        "Rename all module directories (module0 through module4) to pkg0 through pkg4. Update the index.ts files inside each to export pkg{N} instead of v{N}. Do all 5 modules.",
    },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    let renamed = 0;
    for (let i = 0; i < 5; i++) {
      if (existsSync(join(ctx.workspace.path, `pkg${i}`, "index.ts"))) renamed++;
    }
    const manyTools = calls.length >= 5;
    const checks = [
      { name: "renamed modules", passed: renamed >= 3, dimension: "Execution" as const, weight: 2 },
      { name: "used multiple tool calls", passed: manyTools, dimension: "Planning" as const },
      { name: "no excessive errors", passed: ctx.metrics.errors < 3, dimension: "Recovery" as const },
    ];
    const rubric = computeRubricFromChecks(["Execution", "Planning", "Recovery"], checks);
    return { passed: renamed >= 3, score: aggregateScore(rubric), rubric, checks };
  },
};
