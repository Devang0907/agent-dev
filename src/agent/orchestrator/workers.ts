import type { AgentMode } from "../mode.js";

export type WorkerId = "explore" | "implement" | "shell" | "plan";

export interface WorkerProfile {
  id: WorkerId;
  name: string;
  description: string;
  tools: string[];
  mode: AgentMode;
  systemPrompt: string;
}

const WORKER_PROMPTS: Record<WorkerId, string> = {
  explore:
    "You are an explore worker. Research the codebase read-only: find files, patterns, and conventions relevant to your assigned task. Report findings clearly with file paths. Do not edit files.",
  implement:
    "You are an implement worker. Make focused code changes for your assigned task only. Explore with read/grep first if needed, then write or edit. Run verify when tests exist. Report what you changed.",
  shell:
    "You are a shell worker. Run commands, tests, and builds for your assigned task. Report command output and pass/fail status concisely.",
  plan:
    "You are a plan worker. Draft architecture or step-by-step plans in `.agent-dev/plans/` when helpful. Use read/grep to understand context. Do not modify project source files.",
};

export const WORKER_PROFILES: Record<WorkerId, WorkerProfile> = {
  explore: {
    id: "explore",
    name: "Explore",
    description: "Read-only codebase research",
    tools: ["read", "grep", "git", "docs", "browser"],
    mode: "build",
    systemPrompt: WORKER_PROMPTS.explore,
  },
  implement: {
    id: "implement",
    name: "Implement",
    description: "Code changes and verification",
    tools: ["read", "write", "edit", "diff", "grep", "verify"],
    mode: "build",
    systemPrompt: WORKER_PROMPTS.implement,
  },
  shell: {
    id: "shell",
    name: "Shell",
    description: "Commands and tests",
    tools: ["bash", "exec", "verify"],
    mode: "build",
    systemPrompt: WORKER_PROMPTS.shell,
  },
  plan: {
    id: "plan",
    name: "Plan",
    description: "Architecture and planning docs",
    tools: ["plan", "read", "grep"],
    mode: "plan",
    systemPrompt: WORKER_PROMPTS.plan,
  },
};

export const BOSS_TOOL_NAMES = ["plan", "delegate"] as const;

export function getWorkerProfile(workerId: string): WorkerProfile | null {
  if (workerId in WORKER_PROFILES) {
    return WORKER_PROFILES[workerId as WorkerId];
  }
  return null;
}

export function listWorkerIds(): WorkerId[] {
  return Object.keys(WORKER_PROFILES) as WorkerId[];
}

export function formatWorkerCatalog(): string {
  return listWorkerIds()
    .map((id) => {
      const p = WORKER_PROFILES[id];
      return `- ${id}: ${p.description} (tools: ${p.tools.join(", ")})`;
    })
    .join("\n");
}
