import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { platform as osPlatform } from "node:os";
import type { ToolDefinition } from "../../providers/types.js";
import { getShellConfig } from "../platform.js";
import { isAllowedPlanWritePath } from "../mode.js";
import { executeShellCommand } from "./shell.js";
import { resolvePath, assertWithinWorkdir } from "./paths.js";
import { isSkillPath } from "../skills.js";

export const readTool: ToolDefinition = {
  name: "read",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

export async function executeRead(args: { path: string }, workdir: string): Promise<string> {
  const filePath = resolvePath(args.path, workdir);
  if (!isSkillPath(filePath)) {
    assertWithinWorkdir(filePath, workdir);
  }
  if (!existsSync(filePath)) {
    return `Error: file not found: ${args.path}`;
  }
  const content = readFileSync(filePath, "utf-8");
  return content.length > 50000 ? content.slice(0, 50000) + "\n... (truncated)" : content;
}

export const writeTool: ToolDefinition = {
  name: "write",
  description: "Write content to a file (creates or overwrites)",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
};

export async function executeWrite(
  args: { path: string; content: string },
  workdir: string,
): Promise<string> {
  const filePath = resolvePath(args.path, workdir);
  assertWithinWorkdir(filePath, workdir);
  if (isAllowedPlanWritePath(args.path)) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  writeFileSync(filePath, args.content, "utf-8");
  return `Written ${args.content.length} bytes to ${args.path}`;
}

export const editTool: ToolDefinition = {
  name: "edit",
  description: "Replace old_string with new_string in a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" },
      old_string: { type: "string", description: "String to find" },
      new_string: { type: "string", description: "Replacement string" },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },
};

export async function executeEdit(
  args: { path: string; old_string: string; new_string: string },
  workdir: string,
): Promise<string> {
  const filePath = resolvePath(args.path, workdir);
  assertWithinWorkdir(filePath, workdir);
  if (!existsSync(filePath)) {
    return `Error: file not found: ${args.path}`;
  }
  const content = readFileSync(filePath, "utf-8");
  if (!content.includes(args.old_string)) {
    return `Error: old_string not found in ${args.path}`;
  }
  const newContent = content.replace(args.old_string, args.new_string);
  writeFileSync(filePath, newContent, "utf-8");
  return `Edited ${args.path}`;
}

export const bashTool: ToolDefinition = {
  name: "bash",
  description:
    osPlatform() === "win32"
      ? "Run a PowerShell command on the user's real machine. Use for npm run dev, npm install, builds, tests. Dev servers start in background and return a localhost URL. Chain with ; on Windows PowerShell 5."
      : "Run a bash command on the user's real machine. Use for npm run dev, npm install, builds, tests. Dev servers start in background and return a localhost URL.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

export async function executeBash(
  args: { command: string },
  workdir: string,
): Promise<string> {
  const shell = getShellConfig();
  const result = await executeShellCommand(args.command, workdir);
  if (result.startsWith("Error:")) {
    return `${result}\n(shell: ${shell.name})`;
  }
  return result;
}

/** Groq gpt-oss models sometimes call `exec` instead of `bash`. */
export const execTool: ToolDefinition = {
  name: "exec",
  description: "Run a shell command. Prefer the bash tool when possible.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      cmd: {
        description: "Command string or argv array (legacy alias)",
      },
    },
    additionalProperties: true,
  },
};

export function commandFromExecArgs(args: Record<string, unknown>): string | undefined {
  const direct = args.command ?? args.cmd;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (!Array.isArray(direct)) return undefined;

  const parts = direct.map(String).filter(Boolean);
  if (parts.length === 0) return undefined;

  if (parts[0] === "bash" || parts[0] === "sh") {
    const flag = parts[1];
    if (flag === "-c" || flag === "lc") return parts.slice(2).join(" ").trim();
    return parts.slice(1).join(" ").trim();
  }

  return parts.join(" ").trim();
}

export async function executeExec(
  args: Record<string, unknown>,
  workdir: string,
): Promise<string> {
  const command = commandFromExecArgs(args);
  if (!command) return "Error: command is required";
  return executeBash({ command }, workdir);
}
