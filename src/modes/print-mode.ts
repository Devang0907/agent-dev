import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentSession, SessionEvent } from "../agent/session.js";
import { formatSkillsListMessage, resolveSkillCommand } from "../agent/skills.js";
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
  const settings = session.getSettings();
  const workdir = process.cwd();
  const skillCommand = resolveSkillCommand(prompt, workdir, settings);

  if (skillCommand.type === "list") {
    console.log(formatSkillsListMessage(workdir, settings));
    return;
  }
  if (skillCommand.type === "error") {
    console.error(chalk.red(skillCommand.message));
    process.exit(1);
  }

  const agentPrompt = skillCommand.type === "prompt" ? skillCommand.content : prompt;
  const model = session.getModel();
  console.log(chalk.gray(`Model: ${model.provider}/${model.id}`));

  const userMsg = { role: "user" as const, content: agentPrompt };
  const prior = session.getMessages();

  let output = "";

  await runAgentLoop({
    model,
    messages: [...prior, userMsg],
    settings: session.getSettings(),
    workdir: process.cwd(),
    agentMode: session.getAgentMode(),
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
