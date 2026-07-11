import type { EvalScenario } from "../types.js";
import { readWorkspaceFile, getGitStatus } from "../../fixtures/workspace.js";
import { getToolCalls, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const restApiE2e: EvalScenario = {
  id: "rest-api-e2e",
  title: "REST API End-to-End",
  tags: ["full"],
  description: "Create REST API, write tests, run tests, fix failures, commit",
  rubric: ["Planning", "Execution", "Recovery"],
  timeoutMs: 600_000,

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { execSync } = await import("node:child_process");
    writeFileSync(join(ctx.workspace.path, "package.json"), JSON.stringify({ name: "api-e2e", type: "module", version: "1.0.0" }, null, 2));
    execSync("git init", { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.email "eval@test.com"', { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git config user.name "Eval"', { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync("git add .", { cwd: ctx.workspace.path, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: ctx.workspace.path, stdio: "ignore" });
  },

  turns: [
    {
      prompt:
        "Create a simple REST API in src/server.ts with a GET /health endpoint returning {status:'ok'}. Write a test in src/server.test.ts. Run tests, fix any failures, then commit with message 'feat: add health endpoint'.",
      approvalPolicy: "selective",
    },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const hasServer = readWorkspaceFile(ctx.workspace, "src/server.ts") !== null;
    const hasTest = readWorkspaceFile(ctx.workspace, "src/server.test.ts") !== null;
    const ranTests = calls.some((c) => (c.name === "bash" || c.name === "exec") && c.args.includes("test"));
    const committed = calls.some((c) => c.name === "git" && c.args.includes("commit")) || getGitStatus(ctx.workspace).length === 0;

    const checks = [
      { name: "created server", passed: hasServer, dimension: "Execution" as const, weight: 2 },
      { name: "created tests", passed: hasTest, dimension: "Planning" as const, weight: 2 },
      { name: "ran tests", passed: ranTests, dimension: "Execution" as const },
      { name: "committed changes", passed: committed, dimension: "Execution" as const, weight: 2 },
    ];
    const rubric = computeRubricFromChecks(["Planning", "Execution", "Recovery"], checks);
    return { passed: hasServer && hasTest, score: aggregateScore(rubric), rubric, checks };
  },
};
