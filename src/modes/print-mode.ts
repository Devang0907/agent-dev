import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentSession } from "../agent/session.js";
import { runAgentLoop, type PermissionRequest } from "../agent/loop.js";

async function promptCommandApproval(request: PermissionRequest): Promise<boolean> {
  console.log(chalk.yellow(`\nCommand approval required:`));
  console.log(chalk.white(`  ${request.command}`));

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(chalk.gray("Run? [y/N] "));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

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
    onPermissionRequest: promptCommandApproval,
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
