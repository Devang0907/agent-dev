import type { AgentSession, SessionEvent } from "../../src/agent/session.js";
import type { Model } from "../../src/providers/types.js";
import type { Settings } from "../../src/config/settings.js";
import type { RubricDimension, RubricScores } from "../graders/types.js";
import type { MetricsSnapshot } from "../metrics/collector.js";
import type { ApprovalPolicy } from "../mocks/approval-policy.js";
import type { FixtureWorkspace } from "../fixtures/workspace.js";

export type ScenarioTag = "smoke" | "full" | "deterministic";

export interface EvalTurn {
  prompt: string;
  afterTurn?: (ctx: EvalContext) => Promise<void>;
  approvalPolicy?: ApprovalPolicy;
}

export interface EvalContext {
  workspace: FixtureWorkspace;
  session: AgentSession;
  events: SessionEvent[];
  metrics: MetricsSnapshot;
  artifacts: Map<string, unknown>;
  model: Model;
  settings: Settings;
}

export interface GradeResult {
  passed: boolean;
  score: number;
  rubric: RubricScores;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  notes?: string[];
}

export interface EvalScenario {
  id: string;
  title: string;
  tags: ScenarioTag[];
  description: string;
  rubric: RubricDimension[];
  timeoutMs?: number;
  modes?: Array<"build" | "plan" | "boss" | "multi">;
  setup: (ctx: EvalContext) => Promise<void>;
  turns: EvalTurn[] | ((ctx: EvalContext) => Promise<EvalTurn[]>);
  grade: (ctx: EvalContext) => Promise<GradeResult>;
}

export interface ScenarioResult {
  scenarioId: string;
  title: string;
  status: "passed" | "failed" | "skipped" | "error";
  grade?: GradeResult;
  metrics: MetricsSnapshot;
  error?: string;
  wallTimeMs: number;
}
