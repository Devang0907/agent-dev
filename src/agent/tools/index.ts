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
import { spawnAgentsTool, executeSpawnAgents } from "../multi-agent/tools/spawn-agents.js";
import { askUserTool, executeAskUser } from "../multi-agent/tools/ask-user.js";
import { databaseTool, executeDatabase, isSelectOnlyQuery, formatDatabasePermissionCommand } from "./database.js";
import { docsTool, executeDocs } from "./docs.js";
import { verifyTool, executeVerify } from "./verify.js";
import { mcpTool, executeMcp, formatMcpPermissionCommand } from "./mcp.js";
import { skillTool, executeSkill } from "./skill.js";
import { scheduleTool, executeSchedule } from "./schedule.js";
import { browserTool, executeBrowser } from "./browser/index.js";
import { listDirTool, executeListDir } from "./list-dir.js";
import {
  isDestructiveBrowserAction,
  formatBrowserPermissionCommand,
} from "./browser/detectors.js";
import { BROWSER_INTERACTION_ACTIONS } from "./browser/types.js";
import type { BrowserToolArgs } from "./browser/types.js";
import { resolveToolPermission } from "../permissions.js";
import type { Settings } from "../../config/settings.js";

export interface AgentTool {
  definition: ToolDefinition;
  execute: (
    args: Record<string, unknown>,
    workdir: string,
    sessionId?: string,
  ) => Promise<string>;
}

export const BUILTIN_TOOLS: AgentTool[] = [
  { definition: readTool, execute: (args, wd) => executeRead(args as { path: string }, wd) },
  { definition: listDirTool, execute: (args, wd) => executeListDir(args as { path?: string; recursive?: boolean }, wd) },
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
  { definition: planTool, execute: (args, _wd, sessionId) => executePlan(args as Parameters<typeof executePlan>[0], sessionId) },
  { definition: delegateTool, execute: (args) => executeDelegate(args as Parameters<typeof executeDelegate>[0]) },
  { definition: spawnAgentsTool, execute: (args) => executeSpawnAgents(args as Parameters<typeof executeSpawnAgents>[0]) },
  { definition: askUserTool, execute: (args) => executeAskUser(args as Parameters<typeof executeAskUser>[0]) },
  { definition: databaseTool, execute: (args, wd) => executeDatabase(args as { database: string; query: string }, wd) },
  { definition: verifyTool, execute: (args, wd) => executeVerify(args as { command?: string; type?: string }, wd) },
  { definition: mcpTool, execute: (args) => executeMcp(args as { action: string; server?: string; tool?: string; arguments?: Record<string, unknown> }) },
  { definition: skillTool, execute: (args) => executeSkill(args as { name: string }) },
  { definition: scheduleTool, execute: (args) => executeSchedule(args as Parameters<typeof executeSchedule>[0]) },
  { definition: browserTool, execute: (args) => executeBrowser(args as unknown as BrowserToolArgs) },
];

/** @deprecated Use needsToolPermission instead */
export const PERMISSION_REQUIRED_TOOLS = new Set(["bash"]);

function defaultNeedsToolPermission(name: string, args: Record<string, unknown>): boolean {
  if (name === "bash" || name === "exec" || name === "verify") return true;
  if (name === "git") return isGitWriteAction(String(args.action ?? ""));
  if (name === "database") return !isSelectOnlyQuery(String(args.query ?? ""));
  if (name === "mcp") return String(args.action ?? "").toLowerCase() === "call_tool";
  if (name === "browser") {
    const action = String(args.action ?? "");
    if (BROWSER_INTERACTION_ACTIONS.has(action as BrowserToolArgs["action"])) {
      return args.requiresApproval === true || isDestructiveBrowserAction(args as unknown as BrowserToolArgs);
    }
  }
  return false;
}

export function needsToolPermission(
  name: string,
  args: Record<string, unknown>,
  workdir?: string,
  settings?: Settings,
): boolean {
  if (workdir && settings) {
    return resolveToolPermission(name, args, workdir, settings) === "ask";
  }
  return defaultNeedsToolPermission(name, args);
}

export { resolveToolPermission } from "../permissions.js";
export type { PermissionAction } from "../permissions.js";

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
  if (name === "browser") return formatBrowserPermissionCommand(args as unknown as BrowserToolArgs);
  if (name === "verify") {
    const cmd = String(args.command ?? "").trim();
    return cmd ? `verify: ${cmd}` : "verify";
  }
  if (name === "write" || name === "edit") {
    return `${name} ${String(args.path ?? "").trim()}`;
  }
  return name;
}

/** Tools only available to the boss orchestrator */
const BOSS_ONLY_TOOLS = new Set(["delegate"]);

/** Tools only available to the multi-agent orchestrator */
const MULTI_ONLY_TOOLS = new Set(["spawn_agents", "ask_user"]);

export function getToolDefinitions(
  mode: AgentMode = "build",
  allowedTools?: string[],
): ToolDefinition[] {
  let all = BUILTIN_TOOLS.map((t) => t.definition);
  if (allowedTools) {
    const set = new Set(allowedTools);
    all = all.filter((t) => set.has(t.name));
  } else {
    all = all.filter((t) => !BOSS_ONLY_TOOLS.has(t.name) && !MULTI_ONLY_TOOLS.has(t.name));
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
  sessionId?: string,
): Promise<string> {
  const tool = BUILTIN_TOOLS.find((t) => t.definition.name === name);
  if (!tool) return `Error: unknown tool ${name}`;
  try {
    return await tool.execute(args, workdir, sessionId);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
