import type { EvalScenario } from "../types.js";
import { readWorkspaceFile } from "../../fixtures/workspace.js";
import { getAssistantText, computeRubricFromChecks, aggregateScore } from "../../graders/rules/common.js";

export const longConversation30: EvalScenario = {
  id: "long-conversation-30",
  title: "Long Conversation (30 turns)",
  tags: ["full"],
  description: "30-turn conversation testing context retention",
  rubric: ["ContextRetention", "Reasoning"],
  timeoutMs: 600_000,

  async setup(ctx) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(ctx.workspace.path, "DECISION.md"), "Project codename: PHOENIX-42\n");
  },

  turns: async () => {
    const turns = [];
    for (let i = 1; i <= 30; i++) {
      if (i === 1) {
        turns.push({ prompt: "Remember: our project codename is PHOENIX-42. Acknowledge this." });
      } else if (i === 15) {
        turns.push({ prompt: "What is our project codename? Reply with just the codename." });
      } else if (i === 30) {
        turns.push({ prompt: "What was the project codename I told you at the start? Reply with just the codename." });
      } else {
        turns.push({ prompt: `Task ${i}: List files in the workspace using list_dir.` });
      }
    }
    return turns;
  },

  async grade(ctx) {
    const text = getAssistantText(ctx.events);
    const remembered = /PHOENIX-42/i.test(text);
    const checks = [
      { name: "retained codename", passed: remembered, dimension: "ContextRetention" as const, weight: 3 },
      { name: "completed turns", passed: ctx.metrics.turnCount >= 25, dimension: "ContextRetention" as const },
    ];
    const rubric = computeRubricFromChecks(["ContextRetention", "Reasoning"], checks);
    return { passed: remembered, score: aggregateScore(rubric), rubric, checks };
  },
};
