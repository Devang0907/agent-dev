import type { ToolDefinition } from "../../providers/types.js";
import {
  readTool,
  writeTool,
  editTool,
  bashTool,
  executeRead,
  executeWrite,
  executeEdit,
  executeBash,
} from "./read.js";
import { webSearchTool, executeWebSearch } from "./search.js";

export interface AgentTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>, workdir: string) => Promise<string>;
}

export const BUILTIN_TOOLS: AgentTool[] = [
  { definition: readTool, execute: (args, wd) => executeRead(args as { path: string }, wd) },
  { definition: writeTool, execute: (args, wd) => executeWrite(args as { path: string; content: string }, wd) },
  { definition: editTool, execute: (args, wd) => executeEdit(args as { path: string; old_string: string; new_string: string }, wd) },
  { definition: bashTool, execute: (args, wd) => executeBash(args as { command: string }, wd) },
  { definition: webSearchTool, execute: (args) => executeWebSearch(args as { query: string }) },
];

export const PERMISSION_REQUIRED_TOOLS = new Set(["bash"]);

export function getToolDefinitions(): ToolDefinition[] {
  return BUILTIN_TOOLS.map((t) => t.definition);
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
