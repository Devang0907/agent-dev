import chalk from "chalk";
import { formatToolStatus, truncate } from "./format.js";
import type { ToolCall } from "../../providers/types.js";

function prefix(label: string, color: (s: string) => string): string {
  return color(`[${label}]`);
}

export function logGateway(message: string): void {
  console.log(chalk.gray(`[telegram] ${message}`));
}

export function logUserMessage(userId: number, text: string): void {
  console.log(`${prefix("user", chalk.cyan)} ${chalk.dim(`(${userId})`)} ${text}`);
}

export function logUserCommand(userId: number, command: string): void {
  console.log(`${prefix("user", chalk.cyan)} ${chalk.dim(`(${userId})`)} ${chalk.white(command)}`);
}

export function logAgentStart(): void {
  process.stdout.write(`${prefix("agent", chalk.green)} `);
}

export function logAgentText(delta: string): void {
  process.stdout.write(delta);
}

export function logAgentEnd(): void {
  process.stdout.write("\n");
}

export function logToolCall(toolCall: ToolCall, workerId?: string): void {
  const tag = workerId ? chalk.gray(` [${workerId}]`) : "";
  console.log(`${prefix("tool", chalk.yellow)}${tag} ${formatToolStatus(toolCall)}`);
}

export function logToolResult(result: string, workerId?: string): void {
  const tag = workerId ? chalk.gray(` [${workerId}]`) : "";
  console.log(`${prefix("tool", chalk.gray)}${tag} ${truncate(result, 500)}`);
}

export function logDelegationStart(workerId: string, runId: string, task: string): void {
  console.log(`${prefix("boss", chalk.magenta)} [${workerId}#${runId}] ${truncate(task, 300)}`);
}

export function logDelegationEnd(workerId: string, runId: string, status: string): void {
  const color =
    status === "success" ? chalk.green : status === "error" ? chalk.red : chalk.yellow;
  console.log(color(`[boss] [${workerId}#${runId}] ${status}`));
}

export function logApprovalRequest(command: string, workerId?: string, runId?: string): void {
  const tag = workerId && runId ? chalk.gray(` [${workerId}#${runId}]`) : "";
  console.log(`${prefix("approval", chalk.yellow)}${tag} ${truncate(command, 300)}`);
}

export function logApprovalResult(approved: boolean): void {
  console.log(
    approved
      ? chalk.green("[approval] Approved")
      : chalk.red("[approval] Denied"),
  );
}

export function logError(message: string): void {
  console.error(chalk.red(`[agent] Error: ${message}`));
}
