import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentSession, SessionEvent } from "../agent/session.js";
import { formatSkillsListMessage, resolveSkillCommand } from "../agent/skills.js";
import type { CoreAgentEvent } from "../agent/loop.js";

async function promptCommandApproval(
  request: { command: string; workerId?: string; runId?: string },
): Promise<boolean> {
  const workerTag =
    request.workerId && request.runId
      ? chalk.gray(` [${request.workerId}#${request.runId}]`)
      : "";
  console.log(chalk.yellow(`\nCommand approval required${workerTag}:`));
  console.log(chalk.white(`  ${request.command}`));

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(chalk.gray("Run? [y/N] "));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function isCoreAgentEvent(event: SessionEvent): event is CoreAgentEvent {
  return (
    event.type === "message_start" ||
    event.type === "text_delta" ||
    event.type === "tool_call" ||
    event.type === "tool_result" ||
    event.type === "turn_end" ||
    event.type === "error"
  );
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

  const model = session.getModel();
  const boss = session.getOrchestratorMode() === "boss";
  console.log(
    chalk.gray(`Model: ${model.provider}/${model.id}${boss ? " · BOSS mode" : ""}`),
  );

  let activeWorker: { runId: string; workerId: string } | null = null;

  const handler = (event: SessionEvent) => {
    if (event.type === "permission_request") {
      void (async () => {
        const approved = await promptCommandApproval(event.request);
        session.respondToPermission(approved);
      })();
      return;
    }
    if (event.type === "delegation_start") {
      activeWorker = { runId: event.runId, workerId: event.workerId };
      console.log(
        chalk.cyan(`\n[${event.workerId}#${event.runId}] ${event.task}`),
      );
      return;
    }
    if (event.type === "delegation_end") {
      const color =
        event.status === "success"
          ? chalk.green
          : event.status === "error"
            ? chalk.red
            : chalk.yellow;
      console.log(color(`\n[${event.workerId}#${event.runId}] ${event.status}`));
      activeWorker = null;
      return;
    }
    if (event.type === "agent_event") {
      const inner = event.event;
      const prefix = chalk.gray(`[${event.workerId}#${event.runId}] `);
      if (inner.type === "tool_call") {
        console.log(prefix + chalk.yellow(`tool: ${inner.toolCall.name}`));
      } else if (inner.type === "tool_result") {
        console.log(prefix + chalk.gray(inner.result.slice(0, 500)));
      }
      return;
    }
    if (!isCoreAgentEvent(event)) return;

    if (event.type === "text_delta" && !activeWorker) {
      process.stdout.write(event.delta);
    } else if (event.type === "tool_call" && !activeWorker) {
      console.log(chalk.yellow(`\n[tool: ${event.toolCall.name}]`));
    } else if (event.type === "tool_result" && !activeWorker) {
      console.log(chalk.gray(event.result.slice(0, 500)));
    } else if (event.type === "error") {
      console.error(chalk.red(event.message));
    }
  };

  session.on("event", handler);

  try {
    await session.prompt(prompt);
  } finally {
    session.off("event", handler);
  }

  console.log();
}
