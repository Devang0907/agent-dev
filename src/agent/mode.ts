import { resolve } from "node:path";

export type AgentMode = "build" | "plan";

export const AGENT_MODES: AgentMode[] = ["build", "plan"];

export function cycleAgentMode(current: AgentMode, direction: 1 | -1 = 1): AgentMode {
  const idx = AGENT_MODES.indexOf(current);
  const next = (idx + direction + AGENT_MODES.length) % AGENT_MODES.length;
  return AGENT_MODES[next]!;
}

export function parseAgentMode(value: string | undefined): AgentMode {
  return value === "plan" ? "plan" : "build";
}

/** Paths where plan-mode writes are allowed (relative to project root). */
export function isAllowedPlanWritePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    /^\.agent-dev\/plans\/[^/]+\.md$/i.test(normalized) ||
    /^\.agents\/plans\/[^/]+\.md$/i.test(normalized)
  );
}

const PLAN_BLOCKED_TOOLS = new Set(["bash", "exec", "verify", "database", "mcp"]);

export function getToolDefinitionsForMode(
  all: { name: string }[],
  mode: AgentMode,
): { name: string }[] {
  if (mode === "build") return all;
  return all.filter((t) => !PLAN_BLOCKED_TOOLS.has(t.name));
}

export function isToolBlockedInPlanMode(
  name: string,
  args: Record<string, unknown>,
  workdir: string,
): string | null {
  if (name === "write" || name === "edit") {
    const path = String(args.path ?? "");
    if (isAllowedPlanWritePath(path)) return null;
    return "Plan mode: file edits are not allowed (except `.agent-dev/plans/*.md`). Press Tab to switch to Build mode.";
  }

  if (name === "diff") return null;

  if (PLAN_BLOCKED_TOOLS.has(name)) {
    if (name === "bash" || name === "exec") {
      return "Plan mode: shell commands are not allowed. Press Tab to switch to Build mode.";
    }
    if (name === "verify") {
      return "Plan mode: running tests/builds is not allowed. Press Tab to switch to Build mode.";
    }
    if (name === "database") {
      return "Plan mode: database queries are not allowed. Press Tab to switch to Build mode.";
    }
    if (name === "mcp") {
      return "Plan mode: MCP tool calls are not allowed. Press Tab to switch to Build mode.";
    }
  }

  if (name === "git") {
    const action = String(args.action ?? "").toLowerCase();
    const writeActions = new Set(["commit", "add", "reset", "checkout", "merge", "rebase", "push", "pull", "stash", "tag"]);
    if (writeActions.has(action)) {
      return "Plan mode: git write actions are not allowed. Press Tab to switch to Build mode.";
    }
  }

  void workdir;
  return null;
}

export function planModeSystemAppend(workdir: string): string {
  const plansDir = resolve(workdir, ".agent-dev", "plans").replace(/\\/g, "/");
  return `
Plan mode is ACTIVE — read-only exploration and planning phase.

CRITICAL restrictions:
- Do NOT edit, create, or delete project files (except plan markdown in \`.agent-dev/plans/*.md\`)
- Do NOT run shell commands (bash, exec) or tests (verify)
- Do NOT run database or MCP mutations
- Git read-only only (status, diff, log — no commit/push)

You SHOULD:
- Use read, grep, and git read commands to explore the codebase
- Use docs and web_search for research
- Use the plan tool to track multi-step work
- Write detailed plans to \`.agent-dev/plans/<name>.md\` when helpful
- Ask clarifying questions before proposing implementation

Plans directory: ${plansDir}
When the plan is ready, tell the user to press Tab to switch to Build mode to implement.`;
}

export function buildModeSystemAppend(): string {
  return `
Build mode is ACTIVE — full tool access.

You may edit files, run shell commands (with user approval), run tests, and implement changes.
If a plan exists in \`.agent-dev/plans/\` or the plan tool, follow it step by step.`;
}

export function buildSwitchReminder(planPath?: string): string {
  const base =
    "Operational mode changed from Plan to Build. You may now edit files, run commands, and implement changes.";
  if (planPath) {
    return `${base}\n\nA plan file exists at ${planPath}. Re-read relevant files, then execute the plan.`;
  }
  return base;
}
