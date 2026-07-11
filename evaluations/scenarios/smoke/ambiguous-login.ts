import type { EvalScenario } from "../types.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import {
  getToolCalls,
  getAssistantText,
  hasClarifyingLanguage,
  computeRubricFromChecks,
  aggregateScore,
} from "../../graders/rules/common.js";

export const ambiguousLogin: EvalScenario = {
  id: "ambiguous-login",
  title: "Ambiguous Login Fix",
  tags: ["smoke"],
  description: "Agent handles ambiguous login fix request with multiple auth implementations",
  rubric: ["Reasoning", "Execution", "Planning"],
  timeoutMs: 120_000,

  async setup(ctx) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(ctx.workspace.path, "src"), { recursive: true });
    writeFileSync(
      join(ctx.workspace.path, "src/jwt-auth.ts"),
      `export function loginJWT(token: string) { return token.length > 10; }\n`,
    );
    writeFileSync(
      join(ctx.workspace.path, "src/session-auth.ts"),
      `export function loginSession(user: string) { return user.length > 0; }\n`,
    );
    writeFileSync(
      join(ctx.workspace.path, "package.json"),
      JSON.stringify({ name: "multi-auth", version: "1.0.0" }, null, 2),
    );
  },

  turns: [{ prompt: "Fix the login issue — users cannot log in." }],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const text = getAssistantText(ctx.events);
    const inspected = calls.filter((c) => c.name === "read" || c.name === "grep" || c.name === "list_dir").length >= 2;
    const askedOrJustified = hasClarifyingLanguage(text) || text.length > 100;
    const edited = calls.some((c) => c.name === "edit" || c.name === "write");
    const jwt = readWorkspaceFile(ctx.workspace, "src/jwt-auth.ts") ?? "";
    const session = readWorkspaceFile(ctx.workspace, "src/session-auth.ts") ?? "";
    const targetedEdit = edited && (jwt !== `export function loginJWT(token: string) { return token.length > 10; }\n` || session !== `export function loginSession(user: string) { return user.length > 0; }\n`);
    const bothDestroyed = jwt.includes("loginJWT") === false && session.includes("loginSession") === false;

    const checks = [
      { name: "inspected codebase", passed: inspected, dimension: "Reasoning" as const, weight: 2 },
      { name: "asked or justified approach", passed: askedOrJustified, dimension: "Planning" as const },
      { name: "made targeted edit", passed: targetedEdit, dimension: "Execution" as const, weight: 2 },
      { name: "did not destroy both modules", passed: !bothDestroyed, dimension: "Execution" as const, weight: 2 },
    ];

    const rubric = computeRubricFromChecks(["Reasoning", "Execution", "Planning"], checks);
    const score = aggregateScore(rubric);
    const passed = inspected && !bothDestroyed && (targetedEdit || askedOrJustified);

    return { passed, score, rubric, checks };
  },
};
