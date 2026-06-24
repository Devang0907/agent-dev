import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { resolvePath, assertWithinWorkdir } from "./paths.js";

const MAX_ENTRIES = 500;
const MAX_RECURSIVE_DEPTH = 3;

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description:
    "List files and directories at a path (relative to project root). Use instead of shell ls for exploration.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path relative to project root (default: .)" },
      recursive: {
        type: "boolean",
        description: "List subdirectories recursively (max depth 3, default false)",
      },
    },
    additionalProperties: false,
  },
};

interface DirEntry {
  relPath: string;
  isDirectory: boolean;
}

function collectEntries(
  dirPath: string,
  workdir: string,
  recursive: boolean,
  depth = 0,
  acc: DirEntry[] = [],
): DirEntry[] {
  if (acc.length >= MAX_ENTRIES) return acc;

  let names: string[];
  try {
    names = readdirSync(dirPath).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    throw err;
  }

  const dirs: string[] = [];
  const files: string[] = [];

  for (const name of names) {
    const full = join(dirPath, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) dirs.push(name);
    else files.push(name);
  }

  for (const name of dirs) {
    if (acc.length >= MAX_ENTRIES) break;
    const full = join(dirPath, name);
    const rel = relative(workdir, full).replace(/\\/g, "/") || name;
    acc.push({ relPath: rel + "/", isDirectory: true });
    if (recursive && depth < MAX_RECURSIVE_DEPTH) {
      collectEntries(full, workdir, recursive, depth + 1, acc);
    }
  }

  for (const name of files) {
    if (acc.length >= MAX_ENTRIES) break;
    const full = join(dirPath, name);
    const rel = relative(workdir, full).replace(/\\/g, "/") || name;
    acc.push({ relPath: rel, isDirectory: false });
  }

  return acc;
}

export async function executeListDir(
  args: { path?: string; recursive?: boolean },
  workdir: string,
): Promise<string> {
  const relPath = (args.path?.trim() || ".").replace(/\\/g, "/");
  const dirPath = resolvePath(relPath, workdir);
  assertWithinWorkdir(dirPath, workdir);

  try {
    if (!statSync(dirPath).isDirectory()) {
      return `Error: not a directory: ${relPath}`;
    }
  } catch {
    return `Error: directory not found: ${relPath}`;
  }

  const recursive = args.recursive === true;
  const entries = collectEntries(dirPath, workdir, recursive);
  if (entries.length === 0) return "(empty directory)";

  const lines = entries.map((e) => e.relPath);
  const truncated = entries.length >= MAX_ENTRIES;
  const header = recursive ? `Contents of ${relPath} (recursive):` : `Contents of ${relPath}:`;
  const footer = truncated ? `\n... (truncated at ${MAX_ENTRIES} entries)` : "";
  return `${header}\n${lines.join("\n")}${footer}`;
}
