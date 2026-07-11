import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalScenario } from "./types.js";
import { wrongFileRecovery } from "./smoke/wrong-file-recovery.js";
import { ambiguousLogin } from "./smoke/ambiguous-login.js";
import { safetyDestructiveCmd } from "./smoke/safety-destructive-cmd.js";
import { grepBeforeEdit } from "./smoke/grep-before-edit.js";
import { retryOnTestFail } from "./smoke/retry-on-test-fail.js";

// Deterministic scenarios
import { loopGuardDeterministic } from "./deterministic/loop-guard.js";
import { helloDeterministic } from "./deterministic/hello.js";

// Full scenarios
import { restApiE2e } from "./full/rest-api-e2e.js";
import { longConversation30 } from "./full/long-conversation-30.js";
import { taskAbcReturnA } from "./full/task-abc-return-a.js";
import { planReviseAbandon } from "./full/plan-revise-abandon.js";
import { toolChoiceGitStatus } from "./full/tool-choice-git-status.js";
import { fakeApiInvestigation } from "./full/fake-api-investigation.js";
import { largeRepoNavigate } from "./full/large-repo-navigate.js";
import { minimalDiffFix } from "./full/minimal-diff-fix.js";
import { gitCommitQuality } from "./full/git-commit-quality.js";
import { requirementPivot } from "./full/requirement-pivot.js";
import { manyToolCalls } from "./full/many-tool-calls.js";
import { injectedReadFailure } from "./full/injected-read-failure.js";

const ALL_SCENARIOS: EvalScenario[] = [
  // smoke
  wrongFileRecovery,
  ambiguousLogin,
  safetyDestructiveCmd,
  grepBeforeEdit,
  retryOnTestFail,
  // deterministic
  helloDeterministic,
  loopGuardDeterministic,
  // full
  restApiE2e,
  longConversation30,
  taskAbcReturnA,
  planReviseAbandon,
  toolChoiceGitStatus,
  fakeApiInvestigation,
  largeRepoNavigate,
  minimalDiffFix,
  gitCommitQuality,
  requirementPivot,
  manyToolCalls,
  injectedReadFailure,
];

export function getAllScenarios(): EvalScenario[] {
  return ALL_SCENARIOS;
}

export function getScenarioById(id: string): EvalScenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id);
}

export function filterScenarios(opts: {
  tags?: string[];
  ids?: string[];
}): EvalScenario[] {
  let scenarios = ALL_SCENARIOS;

  if (opts.ids && opts.ids.length > 0) {
    return ALL_SCENARIOS.filter((s) => opts.ids!.includes(s.id));
  }

  if (opts.tags && opts.tags.length > 0) {
    scenarios = scenarios.filter((s) => opts.tags!.some((t) => s.tags.includes(t as EvalScenario["tags"][number])));
  }

  return scenarios;
}

export function listScenarios(): void {
  console.log("\nAvailable scenarios:\n");
  for (const s of ALL_SCENARIOS) {
    console.log(`  ${s.id.padEnd(28)} [${s.tags.join(", ")}]`);
    console.log(`    ${s.description}\n`);
  }
}

export function getBaselinesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "baselines");
}

export function getReportsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "reports");
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// unused but kept for future auto-discovery
export function discoverScenarioFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}
