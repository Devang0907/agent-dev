import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MultiAgentProfile, AgentEffort } from "./agents.js";
import { profileCanWrite } from "./agents.js";

export const WORKFLOW_FILE_NAME = "multi_agents.md";

/** Maps Twitter-workflow tool names to this codebase's tool ids. */
const TOOL_NAME_MAP: Record<string, string> = {
  read: "read",
  grep: "grep",
  glob: "list_dir",
  ls: "list_dir",
  list_dir: "list_dir",
  bash: "bash",
  shell: "bash",
  write: "write",
  edit: "edit",
  diff: "diff",
  git: "git",
  docs: "docs",
  verify: "verify",
  test: "verify",
  web_search: "web_search",
  search: "web_search",
};

const DEFAULT_CUSTOM_TOOLS = ["read", "list_dir", "grep", "write", "edit", "diff", "verify"];

export function getWorkflowFilePath(workdir: string): string {
  return join(workdir, WORKFLOW_FILE_NAME);
}

/** Returns file content when multi_agents.md exists and is non-empty, else null. */
export function loadWorkflowFile(workdir: string): string | null {
  const path = getWorkflowFilePath(workdir);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    return content.trim().length > 0 ? content : null;
  } catch {
    return null;
  }
}

function parseEffort(value: string | undefined): AgentEffort {
  const v = value?.trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function parseTools(value: string | undefined): string[] {
  if (!value?.trim()) return [...DEFAULT_CUSTOM_TOOLS];
  const mapped = value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => TOOL_NAME_MAP[t])
    .filter((t): t is string => Boolean(t));
  return mapped.length > 0 ? [...new Set(mapped)] : [...DEFAULT_CUSTOM_TOOLS];
}

interface RawBlock {
  fields: Record<string, string>;
  body: string;
}

/**
 * Splits the file into frontmatter-style blocks:
 * ---
 * name: scout
 * description: ...
 * effort: low
 * tools: Read, Grep, Glob
 * ---
 * <system prompt body until the next block>
 */
function splitBlocks(content: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  // Match "---\nkey: value lines\n---" fence pairs.
  const fenceRe = /^[ \t]*---[ \t]*$/gm;
  const fences: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    fences.push(m.index);
  }

  for (let i = 0; i + 1 < fences.length; i += 2) {
    const headerStart = content.indexOf("\n", fences[i]!) + 1;
    const headerEnd = fences[i + 1]!;
    const header = content.slice(headerStart, headerEnd);

    const fields: Record<string, string> = {};
    for (const line of header.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (match) fields[match[1]!.toLowerCase()] = match[2]!.trim();
    }

    // A header block must at least declare a name; otherwise skip the pair.
    if (!fields.name) continue;

    const bodyStart = content.indexOf("\n", headerEnd) + 1;
    const bodyEnd = i + 2 < fences.length ? fences[i + 2]! : content.length;
    const body = bodyStart > 0 ? content.slice(bodyStart, bodyEnd).trim() : "";
    blocks.push({ fields, body });
  }

  return blocks;
}

/** Parses multi_agents.md content into custom agent profiles. */
export function parseWorkflowAgents(content: string): MultiAgentProfile[] {
  const profiles: MultiAgentProfile[] = [];

  for (const block of splitBlocks(content)) {
    const id = block.fields.name?.trim().toLowerCase();
    if (!id) continue;

    const tools = parseTools(block.fields.tools);
    const canWrite = profileCanWrite(tools);

    profiles.push({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      description: block.fields.description?.trim() || `Custom agent "${id}" from ${WORKFLOW_FILE_NAME}`,
      effort: parseEffort(block.fields.effort),
      tools,
      mode: "build",
      systemPrompt: block.body || `You are the ${id} agent. Execute your assigned task and report concisely.`,
      canWrite,
    });
  }

  return profiles;
}

/** Convenience: load + parse in one step. Null when file missing/empty/unparseable. */
export function loadWorkflowAgents(workdir: string): MultiAgentProfile[] | null {
  const content = loadWorkflowFile(workdir);
  if (!content) return null;
  const profiles = parseWorkflowAgents(content);
  return profiles.length > 0 ? profiles : null;
}
