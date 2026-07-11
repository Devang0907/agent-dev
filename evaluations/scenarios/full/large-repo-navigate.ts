import type { EvalScenario } from "../types.js";
import { generateLargeRepo } from "../../fixtures/generators/large-repo.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import {
  getToolCalls,
  getAssistantText,
  computeRubricFromChecks,
  aggregateScore,
} from "../../graders/rules/common.js";

export const largeRepoNavigate: EvalScenario = {
  id: "large-repo-navigate",
  title: "Large Repository Navigation",
  tags: ["full"],
  description: "Find needle function in large generated repository",
  rubric: ["Reasoning", "ToolSelection", "Execution"],
  timeoutMs: 300_000,

  async setup(ctx) {
    generateLargeRepo(ctx.workspace.path, 150);
  },

  turns: [{ prompt: "Find the function findNeedle() in this codebase and tell me what it returns." }],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const usedSearch = calls.some((c) => c.name === "grep");
    const readCount = calls.filter((c) => c.name === "read").length;
    const answer = getAssistantText(ctx.events);
    const found = /NEEDLE_FOUND_99/i.test(answer);
    const efficient = readCount < 20;
    const checks = [
      { name: "used search", passed: usedSearch, dimension: "ToolSelection" as const, weight: 2 },
      { name: "found needle value", passed: found, dimension: "Execution" as const, weight: 2 },
      { name: "efficient navigation", passed: efficient, dimension: "Reasoning" as const },
    ];
    const rubric = computeRubricFromChecks(["Reasoning", "ToolSelection", "Execution"], checks);
    return { passed: found, score: aggregateScore(rubric), rubric, checks };
  },
};
