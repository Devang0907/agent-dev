import type { EvalScenario } from "../types.js";
import { readWorkspaceFile, runInWorkspace } from "../../fixtures/workspace.js";
import {
  getToolCalls,
  computeRubricFromChecks,
  aggregateScore,
} from "../../graders/rules/common.js";

export const retryOnTestFail: EvalScenario = {
  id: "retry-on-test-fail",
  title: "Retry on Test Failure",
  tags: ["smoke"],
  description: "Agent runs tests, sees failure, fixes code, and re-runs",
  rubric: ["Recovery", "Execution", "Planning"],
  timeoutMs: 180_000,

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(
      join(ctx.workspace.path, "src/add.ts"),
      `export function add(a: number, b: number): number { return a - b; }\n`,
    );
    writeFileSync(
      join(ctx.workspace.path, "src/add.test.ts"),
      `import { add } from "./add.js";
import { describe, it, expect } from "vitest";
describe("add", () => {
  it("adds numbers", () => { expect(add(2, 3)).toBe(5); });
});
`,
    );
    writeFileSync(
      join(ctx.workspace.path, "package.json"),
      JSON.stringify(
        {
          name: "add-test",
          type: "module",
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^4.0.0", typescript: "^5.0.0" },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(ctx.workspace.path, "vitest.config.ts"),
      `import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
`,
    );
  },

  turns: [
    {
      prompt: "Run the tests, fix any failures in src/add.ts, then run tests again to confirm they pass.",
      approvalPolicy: "selective",
    },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const ranTests = calls.filter((c) => (c.name === "bash" || c.name === "exec") && c.args.includes("test")).length >= 1;
    const ranTestsTwice = calls.filter((c) => (c.name === "bash" || c.name === "exec") && c.args.includes("test")).length >= 2;
    const edited = calls.some((c) => c.name === "edit" && c.args.includes("add.ts"));
    const content = readWorkspaceFile(ctx.workspace, "src/add.ts") ?? "";
    const fixed = content.includes("a + b") || content.includes("a+b");

    let testsPass = false;
    try {
      runInWorkspace(ctx.workspace, "npx vitest run 2>&1");
      testsPass = true;
    } catch {
      testsPass = false;
    }

    const checks = [
      { name: "ran tests", passed: ranTests, dimension: "Planning" as const, weight: 2 },
      { name: "edited source file", passed: edited, dimension: "Execution" as const, weight: 2 },
      { name: "fixed the bug", passed: fixed, dimension: "Execution" as const, weight: 2 },
      { name: "re-ran tests", passed: ranTestsTwice, dimension: "Recovery" as const, weight: 2 },
      { name: "tests pass now", passed: testsPass, dimension: "Execution" as const, weight: 2 },
    ];

    const rubric = computeRubricFromChecks(["Recovery", "Execution", "Planning"], checks);
    const score = aggregateScore(rubric);
    const passed = fixed && testsPass;

    return { passed, score, rubric, checks };
  },
};
