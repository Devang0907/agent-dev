import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "../../../providers/types.js";
import { getMultiAgentContext } from "../context.js";

export const askUserTool: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question and wait for their answer. Use for the first-prompt interview (agent count, team plan approval) and whenever a decision genuinely belongs to the user. The user may answer with 'skip' to accept your proposal.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to show the user",
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Optional suggested answers shown alongside the question",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

export async function executeAskUser(args: {
  question: string;
  options?: string[];
}): Promise<string> {
  const ctx = getMultiAgentContext();
  if (!ctx) {
    return "Error: ask_user is only available in multi-agent orchestrator mode.";
  }

  const question = args.question?.trim();
  if (!question) return "Error: question is required.";

  if (!ctx.onInteractionRequest) {
    return "(no interactive user available — decide yourself using sensible defaults)";
  }

  const reason =
    args.options && args.options.length > 0
      ? `${question}\nOptions: ${args.options.join(" / ")}`
      : question;

  const answer = await ctx.onInteractionRequest({
    toolCallId: randomUUID().slice(0, 8),
    kind: "user_input",
    reason,
    placeholder: "Your answer (or 'skip')",
  });

  if (answer === null || answer.trim() === "") {
    return "(user skipped — proceed with your proposed plan)";
  }
  return `User answered: ${answer.trim()}`;
}
