import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";

const DEFAULT_WORKDIR = process.cwd();

function resolvePath(path: string, workdir = DEFAULT_WORKDIR): string {
  return isAbsolute(path) ? path : resolve(workdir, path);
}

function assertWithinWorkdir(path: string, workdir = DEFAULT_WORKDIR): void {
  const resolved = resolve(path);
  const root = resolve(workdir);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path outside working directory: ${path}`);
  }
}

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

export async function executeRead(args: { path: string }, workdir = DEFAULT_WORKDIR): Promise<string> {
  const filePath = resolvePath(args.path, workdir);
  assertWithinWorkdir(filePath, workdir);
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
  workdir = DEFAULT_WORKDIR,
): Promise<string> {
  const filePath = resolvePath(args.path, workdir);
  assertWithinWorkdir(filePath, workdir);
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
  workdir = DEFAULT_WORKDIR,
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
  description: "Run a shell command in the project directory",
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
  workdir = DEFAULT_WORKDIR,
): Promise<string> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  try {
    const { stdout, stderr } = await execAsync(args.command, {
      cwd: workdir,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    const out = stdout + (stderr ? `\n${stderr}` : "");
    return out.trim() || "(no output)";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const out = (e.stdout ?? "") + (e.stderr ? `\n${e.stderr}` : "");
    return out.trim() || (e.message ?? "Command failed");
  }
}
