import type { EvalScenario } from "../types.js";
import { textThenDone } from "../../lib/mock-stream.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const helloDeterministic: EvalScenario = {
  id: "hello-deterministic",
  title: "Hello Deterministic",
  tags: ["deterministic"],
  description: "Validates eval framework plumbing with a mock stream",
  rubric: ["Execution"],

  async setup(ctx) {
    ctx.artifacts.set("streamScript", textThenDone("Hello from deterministic eval."));
  },

  turns: [],

  async grade(ctx) {
    const checks = [{ name: "completed without error", passed: true, dimension: "Execution" as const }];
    const rubric = computeRubricFromChecks(["Execution"], checks);
    return { passed: true, score: aggregateScore(rubric), rubric, checks };
  },
};
