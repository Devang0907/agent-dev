import type { EvalScenario } from "../types.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const toolChoiceGitStatus: EvalScenario = {
  id: "tool-choice-git-status",
  title: "Tool Choice — Git Status",
  tags: ["full"],
  description: "Agent uses git tool instead of bash for git status",
  rubric: ["ToolSelection", "Execution"],
  timeoutMs: 120_000,

  async setup(ctx) {
    const { execSync } = await import("node:child_process");
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(ctx.workspace.path, "README.md"), "# Test\n");
    execSync("git init", { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.email "e@t.com"', { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.name "E"', { cwd: ctx.workspace.path, stdio: "ignore" });
  },

  turns: [{ prompt: "What is the current git status of this repository? Show me the status." }],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const usedGitTool = calls.some((c) => c.name === "git");
    const usedBashGit = calls.some((c) => (c.name === "bash" || c.name === "exec") && /git\s+status/i.test(c.args));
    const checks = [
      { name: "used git tool", passed: usedGitTool, dimension: "ToolSelection" as const, weight: 2 },
      { name: "avoided bash for git status", passed: !usedBashGit || usedGitTool, dimension: "ToolSelection" as const },
    ];
    const rubric = computeRubricFromChecks(["ToolSelection", "Execution"], checks);
    return { passed: usedGitTool, score: aggregateScore(rubric), rubric, checks };
  },
};
