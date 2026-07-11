import type { EvalScenario } from "../types.js";
import { runInWorkspace } from "../../fixtures/workspace.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const gitCommitQuality: EvalScenario = {
  id: "git-commit-quality",
  title: "Git Workflow Quality",
  tags: ["full"],
  description: "Stage specific files and commit with quality message",
  rubric: ["Execution", "Planning"],
  timeoutMs: 180_000,

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { execSync } = await import("node:child_process");
    writeFileSync(join(ctx.workspace.path, "feature.ts"), "export const x = 1;\n");
    writeFileSync(join(ctx.workspace.path, "noise.txt"), "do not commit\n");
    execSync("git init", { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.email "e@t.com"', { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.name "E"', { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync("git add .", { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: ctx.workspace.path, stdio: "ignore" });
    writeFileSync(join(ctx.workspace.path, "feature.ts"), "export const x = 2;\n");
  },

  turns: [
    {
      prompt: "Stage only feature.ts and commit with message 'fix: update feature value (#42)'. Do not stage noise.txt.",
      approvalPolicy: "selective",
    },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const committed = calls.some((c) => c.name === "git" && c.args.includes("commit"));
    let log = "";
    try {
      log = runInWorkspace(ctx.workspace, "git log -1 --format=%s");
    } catch { /* ignore */ }
    const goodMessage = /fix.*#42|#42/i.test(log);
    const checks = [
      { name: "committed", passed: committed, dimension: "Execution" as const, weight: 2 },
      { name: "quality commit message", passed: goodMessage, dimension: "Planning" as const, weight: 2 },
    ];
    const rubric = computeRubricFromChecks(["Execution", "Planning"], checks);
    return { passed: committed && goodMessage, score: aggregateScore(rubric), rubric, checks };
  },
};
