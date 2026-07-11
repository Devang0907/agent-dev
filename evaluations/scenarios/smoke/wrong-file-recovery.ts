import type { EvalScenario } from "../types.js";
import { createFixtureWorkspace, readWorkspaceFile } from "../../fixtures/workspace.js";
import {
  getToolCalls,
  getAssistantText,
  toolUsedBefore,
  computeRubricFromChecks,
  aggregateScore,
} from "../../graders/rules/common.js";

export const wrongFileRecovery: EvalScenario = {
  id: "wrong-file-recovery",
  title: "Wrong File Recovery",
  tags: ["smoke"],
  description: "Agent recovers when given wrong file path and finds correct auth module",
  rubric: ["Reasoning", "Execution", "ToolSelection"],
  timeoutMs: 120_000,

  async setup(ctx) {
    const ws = createFixtureWorkspace({
      files: {
        "src/auth.ts": `export function authenticate(user: string, pass: string): boolean {
  return user === "admin" && pass === "secret";
}
`,
        "package.json": JSON.stringify({ name: "auth-app", version: "1.0.0" }, null, 2),
      },
    });
    ctx.artifacts.set("evalWorkspace", ws);
    // Replace harness workspace path by copying - use ctx.workspace which harness already created
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(join(ctx.workspace.path, "src/auth.ts"), readWorkspaceFile(ws, "src/auth.ts")!);
    writeFileSync(join(ctx.workspace.path, "package.json"), readWorkspaceFile(ws, "package.json")!);
    ws.cleanup();
  },

  turns: [
    {
      prompt:
        "Update the authenticate function in src/auth/login.ts to also accept password 'backup123'. The file is at src/auth/login.ts.",
    },
  ],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const text = getAssistantText(ctx.events);
    const searched = calls.some((c) => c.name === "grep" || c.name === "list_dir");
    const editedAuth = calls.some(
      (c) =>
        (c.name === "edit" || c.name === "write") &&
        (c.args.includes("auth.ts") || c.args.includes("auth")),
    );
    const content = readWorkspaceFile(ctx.workspace, "src/auth.ts") ?? "";
    const hasBackup = content.includes("backup123");

    const checks = [
      { name: "searched repository", passed: searched, dimension: "Reasoning" as const, weight: 2 },
      { name: "edited correct file", passed: editedAuth, dimension: "Execution" as const, weight: 2 },
      { name: "applied correct fix", passed: hasBackup, dimension: "Execution" as const, weight: 2 },
      {
        name: "did not hallucinate login.ts content",
        passed: !content.includes("login.ts") || hasBackup,
        dimension: "Reasoning" as const,
      },
    ];

    const rubric = computeRubricFromChecks(["Reasoning", "Execution", "ToolSelection"], checks);
    const score = aggregateScore(rubric);
    const passed = checks.filter((c) => c.weight && c.weight >= 2).every((c) => c.passed);

    return { passed, score, rubric, checks, notes: text ? [text.slice(0, 200)] : [] };
  },
};
