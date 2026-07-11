import type { RubricScores } from "./types.js";
import { aggregateScore } from "./rules/common.js";

export function formatRubricBlock(rubric: RubricScores, overall: number): string {
  const lines: string[] = [];
  const dims = [
    "Planning",
    "Reasoning",
    "Recovery",
    "ToolSelection",
    "ContextRetention",
    "Execution",
    "Safety",
  ] as const;

  for (const dim of dims) {
    const score = rubric[dim];
    if (score === undefined) continue;
    const dots = ".".repeat(Math.max(1, 18 - dim.length));
    lines.push(`${dim} ${dots} ${score}`);
  }
  lines.push("");
  lines.push(`Overall Score ....... ${overall}/100`);
  return lines.join("\n");
}

export { aggregateScore };
