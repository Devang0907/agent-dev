import type { EvalScenario } from "../types.js";
import { getToolResults, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const injectedReadFailure: EvalScenario = {
  id: "injected-read-failure",
  title: "Tool Failure Recovery",
  tags: ["full"],
  description: "Agent recovers when first read fails (requires toolExecuteHook)",
  rubric: ["Recovery", "Reasoning"],
  timeoutMs: 120_000,

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(ctx.workspace.path, "target.txt"), "important data");
    ctx.artifacts.set("readFailCount", 0);
  },

  turns: [{ prompt: "Read target.txt and tell me its contents." }],

  async grade(ctx) {
    const results = getToolResults(ctx.events);
    const recovered = results.some((r) => r.name === "read" && r.result.includes("important data"));
    const hadError = results.some((r) => r.result.startsWith("Error:"));
    const checks = [
      { name: "eventually read file", passed: recovered, dimension: "Recovery" as const, weight: 2 },
      { name: "handled error gracefully", passed: recovered || !hadError, dimension: "Reasoning" as const },
    ];
    const rubric = computeRubricFromChecks(["Recovery", "Reasoning"], checks);
    // Without hook injection this may fail — that's expected until hook is wired
    return { passed: recovered, score: aggregateScore(rubric), rubric, checks };
  },
};
