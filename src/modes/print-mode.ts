import chalk from "chalk";
import type { AgentSession } from "../agent/session.js";
import { runAgentLoop } from "../agent/loop.js";

export async function runPrintMode(session: AgentSession, prompt: string): Promise<void> {
  const model = session.getModel();
  console.log(chalk.gray(`Model: ${model.provider}/${model.id}`));

  const userMsg = { role: "user" as const, content: prompt };
  const prior = session.getMessages();

  let output = "";

  await runAgentLoop({
    model,
    messages: [...prior, userMsg],
    settings: session.getSettings(),
    workdir: process.cwd(),
    onEvent: (event) => {
      if (event.type === "text_delta") {
        process.stdout.write(event.delta);
        output += event.delta;
      } else if (event.type === "tool_call") {
        console.log(chalk.yellow(`\n[tool: ${event.toolCall.name}]`));
      } else if (event.type === "tool_result") {
        console.log(chalk.gray(event.result.slice(0, 500)));
      } else if (event.type === "error") {
        console.error(chalk.red(event.message));
      }
    },
  });

  if (!output.endsWith("\n")) console.log();
}
