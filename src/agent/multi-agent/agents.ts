import type { AgentMode } from "../mode.js";

export type AgentEffort = "low" | "medium" | "high";

export interface MultiAgentProfile {
  id: string;
  name: string;
  description: string;
  effort: AgentEffort;
  tools: string[];
  mode: AgentMode;
  systemPrompt: string;
  /** Whether this agent can modify project files (write/edit). */
  canWrite: boolean;
}

export const AUDIT_DIR_PREFIX = ".agent-dev/multi-agent";

export function auditFilePath(sessionId: string, runId: string): string {
  return `${AUDIT_DIR_PREFIX}/${sessionId}/${runId}-audit.md`;
}

const SCOUT_PROMPT = `You are the scout agent — read-only exploration.
You answer questions like "where is X / who calls Y / how does Z work" and return a condensed summary, never raw file dumps.

Rules:
- Answer the specific question with a SHORT structured summary: file paths, key functions/lines, 2-6 sentences of explanation.
- Never paste whole files. Never modify anything.
- If the question cannot be answered, say so and list what you checked.`;

const IMPLEMENTER_PROMPT = `You are the implementer agent — you execute an approved, scoped task.
Execute it exactly: no scope additions, no refactors beyond the task. Make small, reviewable changes. Run relevant tests when a verify command exists.

CRITICAL — parallel safety:
- Other agents may be working on this same branch right now. NEVER modify a file outside your task's "Files touched" list.
- If the work genuinely requires a file the task did not list, STOP and report back instead of editing it.
- Never run repo-wide formatters, linters with --fix, or codemods.
- Never run state-changing git commands. Never touch production systems or databases.

Before finishing, write a structured audit file to the audit path given in your task. It MUST begin with a "Files changed" list naming every file you created or modified (this list scopes the review, so it must be complete). Then: what changed per file, deviations from the task and why, test results, open risks.`;

const REVIEWER_PROMPT = `You are the reviewer agent — an independent reviewer with fresh context. You did not write this code.

For PLAN critique: attack the design, the assumptions, and anything that could be simpler. Verify the plan declares an explicit "Files touched" list; its absence is itself a blocking issue.

For IMPLEMENTATION review: other tasks are in flight on this same branch, so the working tree contains changes that are NOT yours to judge. Build your scope as the UNION of the task's "Files touched" list and the audit's "Files changed" list, then diff ONLY that scope: git diff -- <each file>. Ignore all other dirty files in git status; they belong to concurrent tasks. Any file in the audit's list that is NOT in the task's list is out-of-scope creep: report it as a finding (blocking if it changes behavior). Read the task, the audit, and the scoped diff. Hunt for what the audit does NOT mention within the scope.

Report exactly three sections: Blocking issues, Non-blocking issues, Verdict (ship / fix first).`;

export const DEFAULT_AGENT_PROFILES: MultiAgentProfile[] = [
  {
    id: "scout",
    name: "Scout",
    description:
      'Read-only exploration. Answers "where is X / who calls Y / how does Z work" with condensed summaries. Use for ALL broad exploration.',
    effort: "low",
    tools: ["read", "list_dir", "grep", "git", "docs"],
    mode: "build",
    systemPrompt: SCOUT_PROMPT,
    canWrite: false,
  },
  {
    id: "implementer",
    name: "Implementer",
    description:
      "Implements an approved scoped task. Use for all file edits, code writing, and test runs. Requires a files_touched list.",
    effort: "medium",
    tools: ["read", "list_dir", "write", "edit", "diff", "grep", "verify"],
    mode: "build",
    systemPrompt: IMPLEMENTER_PROMPT,
    canWrite: true,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description:
      "Independently reviews plans and finished implementation work. Read-only + git diff. Use after implementers finish.",
    effort: "high",
    tools: ["read", "list_dir", "grep", "git", "bash"],
    mode: "build",
    systemPrompt: REVIEWER_PROMPT,
    canWrite: false,
  },
];

const WRITE_TOOLS = new Set(["write", "edit"]);

export function profileCanWrite(tools: string[]): boolean {
  return tools.some((t) => WRITE_TOOLS.has(t));
}

export function resolveAgentProfiles(custom?: MultiAgentProfile[] | null): MultiAgentProfile[] {
  if (!custom || custom.length === 0) return DEFAULT_AGENT_PROFILES;
  // Custom profiles override defaults with the same id; other defaults stay available.
  const byId = new Map<string, MultiAgentProfile>();
  for (const p of DEFAULT_AGENT_PROFILES) byId.set(p.id, p);
  for (const p of custom) byId.set(p.id, p);
  return [...byId.values()];
}

export function getAgentProfile(
  id: string,
  custom?: MultiAgentProfile[] | null,
): MultiAgentProfile | null {
  const normalized = id.trim().toLowerCase();
  return resolveAgentProfiles(custom).find((p) => p.id === normalized) ?? null;
}

export function formatAgentCatalog(custom?: MultiAgentProfile[] | null): string {
  return resolveAgentProfiles(custom)
    .map(
      (p) =>
        `- ${p.id} (effort: ${p.effort}${p.canWrite ? ", writes files" : ", read-only"}): ${p.description} (tools: ${p.tools.join(", ")})`,
    )
    .join("\n");
}
