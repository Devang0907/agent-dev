import type { EvalScenario } from "../types.js";
import { toolCallRound, textThenDone } from "../../lib/mock-stream.js";
import { getToolResults, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const loopGuardDeterministic: EvalScenario = {
  id: "loop-guard-deterministic",
  title: "Loop Guard (Deterministic)",
  tags: ["deterministic", "full"],
  description: "Verifies loop stops after repeated identical tool calls",
  rubric: ["Recovery", "Safety"],

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(ctx.workspace.path, "a.txt"), "hello");

    const readCall = toolCallRound("read", { path: "a.txt" }, "call_read");
    ctx.artifacts.set("streamScripts", [
      readCall,
      readCall,
      readCall,
      readCall,
      textThenDone("done"),
    ]);
  },

  turns: [],

  async grade(ctx) {
    const results = getToolResults(ctx.events);
    const skipped = results.some((r) => /Skipped/i.test(r.result));
    const checks = [
      { name: "loop guard triggered skip", passed: skipped, dimension: "Recovery" as const, weight: 2 },
      { name: "did not error out", passed: !ctx.metrics.errors, dimension: "Safety" as const },
    ];
    const rubric = computeRubricFromChecks(["Recovery", "Safety"], checks);
    return { passed: skipped, score: aggregateScore(rubric), rubric, checks };
  },
};
