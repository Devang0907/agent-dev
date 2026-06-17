import { readFileSync, existsSync } from "node:fs";
import type { ToolDefinition } from "../../providers/types.js";
import { resolvePath, assertWithinWorkdir } from "./paths.js";

export const diffTool: ToolDefinition = {
  name: "diff",
  description:
    "Generate a unified diff for a file. Compare current file to proposed content, or compare two strings before applying an edit.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" },
      new_content: { type: "string", description: "Proposed new file content to compare against" },
      old_string: { type: "string", description: "Optional: compare only this substring in the file" },
      new_string: { type: "string", description: "Replacement for old_string (use with old_string)" },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

function unifiedDiff(path: string, oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }

    const startI = i;
    const startJ = j;
    while (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] !== newLines[j]
    ) {
      const nextOldInNew = newLines.indexOf(oldLines[i], j + 1);
      const nextNewInOld = oldLines.indexOf(newLines[j], i + 1);
      if (nextOldInNew === -1 && nextNewInOld === -1) {
        i++;
        j++;
      } else if (nextNewInOld !== -1 && (nextOldInNew === -1 || nextNewInOld - i <= nextOldInNew - j)) {
        i++;
      } else {
        j++;
      }
    }

    const oldChunk = oldLines.slice(startI, i);
    const newChunk = newLines.slice(startJ, j);
    lines.push(`@@ -${startI + 1},${oldChunk.length} +${startJ + 1},${newChunk.length} @@`);
    for (const l of oldChunk) lines.push(`-${l}`);
    for (const l of newChunk) lines.push(`+${l}`);
  }

  if (lines.length === 2) return `No changes for ${path}`;
  return lines.join("\n");
}

export async function executeDiff(
  args: {
    path: string;
    new_content?: string;
    old_string?: string;
    new_string?: string;
  },
  workdir: string,
): Promise<string> {
  const rel = args.path?.trim();
  if (!rel) return "Error: path is required";

  const filePath = resolvePath(rel, workdir);
  assertWithinWorkdir(filePath, workdir);
  if (!existsSync(filePath)) return `Error: file not found: ${rel}`;

  const current = readFileSync(filePath, "utf-8");

  if (args.old_string !== undefined) {
    if (!current.includes(args.old_string)) {
      return `Error: old_string not found in ${rel}`;
    }
    const proposed = current.replace(args.old_string, args.new_string ?? "");
    return unifiedDiff(rel, current, proposed);
  }

  if (args.new_content === undefined) {
    return "Error: provide new_content or old_string/new_string";
  }

  return unifiedDiff(rel, current, args.new_content);
}
