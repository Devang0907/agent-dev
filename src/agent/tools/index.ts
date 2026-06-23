import type { ToolDefinition } from "../../providers/types.js";
import type { AgentMode } from "../mode.js";
import { getToolDefinitionsForMode, isToolBlockedInPlanMode } from "../mode.js";
import {
  readTool,
  writeTool,
  editTool,
  bashTool,
  execTool,
  executeRead,
  executeWrite,
  executeEdit,
  executeBash,
  executeExec,
  commandFromExecArgs,
} from "./read.js";
import { webSearchTool, executeWebSearch } from "./search.js";
import { grepTool, executeGrep } from "./grep.js";
import { gitTool, executeGit, isGitWriteAction, formatGitPermissionCommand } from "./git.js";
import { diffTool, executeDiff } from "./diff.js";
import { memoryTool, executeMemory } from "./memory.js";
import { planTool, executePlan } from "./plan.js";
import { delegateTool, executeDelegate } from "./delegate.js";
import { databaseTool, executeDatabase, isSelectOnlyQuery, formatDatabasePermissionCommand } from "./database.js";
import { docsTool, executeDocs } from "./docs.js";
import { verifyTool, executeVerify } from "./verify.js";
import { mcpTool, executeMcp, formatMcpPermissionCommand } from "./mcp.js";
import { skillTool, executeSkill } from "./skill.js";
import { scheduleTool, executeSchedule } from "./schedule.js";

export interface AgentTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>, workdir: string) => Promise<string>;
}

export const BUILTIN_TOOLS: AgentTool[] = [
  { definition: readTool, execute: (args, wd) => executeRead(args as { path: string }, wd) },
  { definition: writeTool, execute: (args, wd) => executeWrite(args as { path: string; content: string }, wd) },
  { definition: editTool, execute: (args, wd) => executeEdit(args as { path: string; old_string: string; new_string: string }, wd) },
  { definition: diffTool, execute: (args, wd) => executeDiff(args as { path: string; new_content?: string; old_string?: string; new_string?: string }, wd) },
  { definition: grepTool, execute: (args, wd) => executeGrep(args as { pattern: string; path?: string; glob?: string; case_insensitive?: boolean; context?: number }, wd) },
  { definition: gitTool, execute: (args, wd) => executeGit(args as { action: string; args?: string }, wd) },
  { definition: bashTool, execute: (args, wd) => executeBash(args as { command: string }, wd) },
  { definition: execTool, execute: (args, wd) => executeExec(args, wd) },
  { definition: webSearchTool, execute: (args) => executeWebSearch(args as { query: string }) },
  { definition: docsTool, execute: (args) => executeDocs(args as { query: string; source?: string; url?: string }) },
  { definition: memoryTool, execute: (args) => executeMemory(args as { action: string; key?: string; value?: string }) },
  { definition: planTool, execute: (args) => executePlan(args as Parameters<typeof executePlan>[0]) },
  { definition: delegateTool, execute: (args) => executeDelegate(args as Parameters<typeof executeDelegate>[0]) },
  { definition: databaseTool, execute: (args, wd) => executeDatabase(args as { database: string; query: string }, wd) },
  { definition: verifyTool, execute: (args, wd) => executeVerify(args as { command?: string; type?: string }, wd) },
  { definition: mcpTool, execute: (args) => executeMcp(args as { action: string; server?: string; tool?: string; arguments?: Record<string, unknown> }) },
  { definition: skillTool, execute: (args) => executeSkill(args as { name: string }) },
  { definition: scheduleTool, execute: (args) => executeSchedule(args as Parameters<typeof executeSchedule>[0]) },
];

/** @deprecated Use needsToolPermission instead */
export const PERMISSION_REQUIRED_TOOLS = new Set(["bash"]);

export function needsToolPermission(name: string, args: Record<string, unknown>): boolean {
  if (name === "bash" || name === "exec") return true;
  if (name === "git") return isGitWriteAction(String(args.action ?? ""));
  if (name === "database") return !isSelectOnlyQuery(String(args.query ?? ""));
  if (name === "mcp") return String(args.action ?? "").toLowerCase() === "call_tool";
  return false;
}

export function formatPermissionCommand(name: string, args: Record<string, unknown>): string {
  if (name === "bash" || name === "exec") {
    if (name === "exec") {
      return String(commandFromExecArgs(args) ?? "");
    }
    return String(args.command ?? "");
  }
  if (name === "git") return formatGitPermissionCommand(args);
  if (name === "database") return formatDatabasePermissionCommand(args);
  if (name === "mcp") return formatMcpPermissionCommand(args);
  return name;
}

/** Tools only available to the boss orchestrator */
const BOSS_ONLY_TOOLS = new Set(["delegate"]);

export function getToolDefinitions(
  mode: AgentMode = "build",
  allowedTools?: string[],
): ToolDefinition[] {
  let all = BUILTIN_TOOLS.map((t) => t.definition);
  if (allowedTools) {
    const set = new Set(allowedTools);
    all = all.filter((t) => set.has(t.name));
  } else {
    all = all.filter((t) => !BOSS_ONLY_TOOLS.has(t.name));
  }
  return getToolDefinitionsForMode(all, mode) as ToolDefinition[];
}

export function checkPlanModeToolBlock(
  mode: AgentMode,
  name: string,
  args: Record<string, unknown>,
  workdir: string,
): string | null {
  if (mode !== "plan") return null;
  return isToolBlockedInPlanMode(name, args, workdir);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workdir: string,
): Promise<string> {
  const tool = BUILTIN_TOOLS.find((t) => t.definition.name === name);
  if (!tool) return `Error: unknown tool ${name}`;
  try {
    return await tool.execute(args, workdir);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
