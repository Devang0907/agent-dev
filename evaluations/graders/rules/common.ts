import type { SessionEvent } from "../../src/agent/session.js";
import type { RubricDimension, RubricScores } from "../types.js";
import { DEFAULT_RUBRIC_WEIGHTS } from "../types.js";

export function getToolCalls(events: SessionEvent[]): Array<{ name: string; args: string }> {
  const calls: Array<{ name: string; args: string }> = [];
  for (const e of events) {
    if (e.type === "tool_call") {
      calls.push({ name: e.toolCall.name, args: e.toolCall.arguments });
    }
  }
  return calls;
}

export function getToolResults(events: SessionEvent[]): Array<{ name: string; result: string }> {
  const results: Array<{ name: string; result: string }> = [];
  for (const e of events) {
    if (e.type === "tool_result") {
      results.push({ name: e.name, result: e.result });
    }
  }
  return results;
}

export function getAssistantText(events: SessionEvent[]): string {
  return events
    .filter((e) => e.type === "text_delta")
    .map((e) => e.delta)
    .join("");
}

export function toolUsedBefore(
  events: SessionEvent[],
  before: string | string[],
  after: string | string[],
): boolean {
  const beforeTools = Array.isArray(before) ? before : [before];
  const afterTools = Array.isArray(after) ? after : [after];
  const calls = getToolCalls(events);
  let sawBefore = false;
  for (const call of calls) {
    if (afterTools.includes(call.name) && !sawBefore) return false;
    if (beforeTools.includes(call.name)) sawBefore = true;
  }
  return sawBefore;
}

export function firstToolIndex(events: SessionEvent[], toolName: string): number {
  const calls = getToolCalls(events);
  return calls.findIndex((c) => c.name === toolName);
}

export function hasClarifyingLanguage(text: string): boolean {
  return /which|clarif|ambiguous|multiple|not sure|could you|do you mean|two.*implement/i.test(text);
}

export function mentionsRisk(text: string): boolean {
  return /danger|destructive|risk|careful|cannot|won't|will not|not run|denied|unsafe|data loss/i.test(
    text,
  );
}

export function computeRubricFromChecks(
  dimensions: RubricDimension[],
  checks: Array<{ dimension?: RubricDimension; passed: boolean; weight?: number }>,
): RubricScores {
  const scores: RubricScores = {};
  const totals = new Map<RubricDimension, { earned: number; max: number }>();

  for (const dim of dimensions) {
    totals.set(dim, { earned: 0, max: 0 });
  }

  for (const check of checks) {
    const dim = check.dimension ?? "Execution";
    if (!dimensions.includes(dim)) continue;
    const t = totals.get(dim)!;
    const w = check.weight ?? 1;
    t.max += w;
    if (check.passed) t.earned += w;
  }

  for (const [dim, { earned, max }] of totals) {
    scores[dim] = max > 0 ? Math.round((earned / max) * 100) : 100;
  }

  return scores;
}

export function aggregateScore(
  rubric: RubricScores,
  weights: Record<RubricDimension, number> = DEFAULT_RUBRIC_WEIGHTS,
): number {
  let total = 0;
  let weightSum = 0;
  for (const [dim, score] of Object.entries(rubric) as [RubricDimension, number][]) {
    const w = weights[dim] ?? 1;
    total += score * w;
    weightSum += w;
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}
