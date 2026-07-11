import type { EvalScenario } from "../types.js";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import {
  getToolCalls,
  toolUsedBefore,
  computeRubricFromChecks,
  aggregateScore,
} from "../../graders/rules/common.js";

function generateMediumFixture(basePath: string): void {
  for (let i = 0; i < 25; i++) {
    const dir = join(basePath, "src", `module${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `util${i}.ts`),
      `export const value${i} = ${i};\nexport function fn${i}() { return ${i}; }\n`,
    );
  }
  mkdirSync(join(basePath, "src"), { recursive: true });
  writeFileSync(
    join(basePath, "src/config.ts"),
    `export const API_KEY = "NEEDLE_42";\nexport const VERSION = "1.0";\n`,
  );
  writeFileSync(join(basePath, "package.json"), JSON.stringify({ name: "medium-app" }, null, 2));
}

export const grepBeforeEdit: EvalScenario = {
  id: "grep-before-edit",
  title: "Grep Before Edit",
  tags: ["smoke"],
  description: "Agent searches repository before editing config file",
  rubric: ["Reasoning", "ToolSelection", "Execution"],
  timeoutMs: 120_000,

  async setup(ctx) {
    generateMediumFixture(ctx.workspace.path);
  },

  turns: [{ prompt: "Change the API_KEY in the config to 'UPDATED_KEY'." }],

  async grade(ctx) {
    const calls = getToolCalls(ctx.events);
    const searchedFirst = toolUsedBefore(ctx.events, ["grep", "list_dir", "read"], ["edit", "write"]);
    const editedConfig = calls.some(
      (c) => (c.name === "edit" || c.name === "write") && c.args.includes("config"),
    );
    const content = readWorkspaceFile(ctx.workspace, "src/config.ts") ?? "";
    const updated = content.includes("UPDATED_KEY");

    const checks = [
      { name: "searched before editing", passed: searchedFirst, dimension: "Reasoning" as const, weight: 2 },
      { name: "edited config file", passed: editedConfig, dimension: "Execution" as const, weight: 2 },
      { name: "applied correct value", passed: updated, dimension: "Execution" as const, weight: 2 },
      {
        name: "used appropriate tools",
        passed: calls.some((c) => ["grep", "read", "edit"].includes(c.name)),
        dimension: "ToolSelection" as const,
      },
    ];

    const rubric = computeRubricFromChecks(["Reasoning", "ToolSelection", "Execution"], checks);
    const score = aggregateScore(rubric);
    const passed = searchedFirst && updated;

    return { passed, score, rubric, checks };
  },
};
