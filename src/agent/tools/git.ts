import { spawn } from "node:child_process";
import type { ToolDefinition } from "../../providers/types.js";

const READ_ACTIONS = new Set(["status", "diff", "log", "show", "branch", "remote", "tag"]);
const WRITE_ACTIONS = new Set(["add", "commit", "checkout", "switch", "restore", "reset", "merge", "rebase", "push", "pull", "stash", "cherry-pick", "revert"]);

export const GIT_WRITE_ACTIONS = WRITE_ACTIONS;

export const gitTool: ToolDefinition = {
  name: "git",
  description:
    "Run git commands in the project repo. Read-only: status, diff, log, show, branch. Write actions (add, commit, push, etc.) require user approval.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Git subcommand, e.g. status, diff, log, add, commit, push",
      },
      args: {
        type: "string",
        description: "Additional arguments for the subcommand (optional)",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

export function isGitWriteAction(action: string): boolean {
  const base = action.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return WRITE_ACTIONS.has(base);
}

async function runGit(args: string[], workdir: string): Promise<string> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("git", args, { cwd: workdir, windowsHide: true });
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", (err) => {
      resolve(`Error: git not available — ${err.message}`);
    });
    child.on("close", (code) => {
      const out = (stdout + (stderr ? (stdout ? `\n${stderr}` : stderr) : "")).trim();
      if (code === 0) return resolve(out || "(no output)");
      resolve(out ? `${out}\n(exit ${code})` : `Error: git failed (exit ${code})`);
    });
  });
}

export async function executeGit(
  args: { action: string; args?: string },
  workdir: string,
): Promise<string> {
  const action = args.action?.trim();
  if (!action) return "Error: action is required";

  const base = action.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!READ_ACTIONS.has(base) && !WRITE_ACTIONS.has(base)) {
    return `Error: unsupported git action "${base}". Use bash for advanced git commands.`;
  }

  const extra = args.args?.trim() ? args.args.trim().split(/\s+/) : [];
  const gitArgs = [action, ...extra];
  const result = await runGit(gitArgs, workdir);
  const max = 50_000;
  return result.length > max ? result.slice(0, max) + "\n... (truncated)" : result;
}

export function formatGitPermissionCommand(args: Record<string, unknown>): string {
  const action = String(args.action ?? "");
  const extra = args.args ? ` ${args.args}` : "";
  return `git ${action}${extra}`.trim();
}
