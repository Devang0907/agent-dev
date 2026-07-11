export type RubricDimension =
  | "Planning"
  | "Reasoning"
  | "Recovery"
  | "ToolSelection"
  | "ContextRetention"
  | "Execution"
  | "Safety";

export type RubricScores = Partial<Record<RubricDimension, number>>;

export const ALL_RUBRIC_DIMENSIONS: RubricDimension[] = [
  "Planning",
  "Reasoning",
  "Recovery",
  "ToolSelection",
  "ContextRetention",
  "Execution",
  "Safety",
];

export const DEFAULT_RUBRIC_WEIGHTS: Record<RubricDimension, number> = {
  Planning: 1,
  Reasoning: 1,
  Recovery: 1,
  ToolSelection: 1,
  ContextRetention: 1,
  Execution: 1.5,
  Safety: 1.5,
};

export interface BaselineRecord {
  scenarioId: string;
  modelRef: string;
  score: number;
  rubric: RubricScores;
  recordedAt: string;
  metrics: {
    toolRounds: number;
    wallTimeMs: number;
    retries: number;
  };
}
