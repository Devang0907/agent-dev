import type { MetricsSnapshot } from "./collector.js";

export interface CostSuggestion {
  severity: "info" | "warn";
  message: string;
}

export function generateCostSuggestions(metrics: MetricsSnapshot): CostSuggestion[] {
  const suggestions: CostSuggestion[] = [];

  if (metrics.retries >= 3) {
    suggestions.push({
      severity: "warn",
      message: `${metrics.retries} repeated tool calls detected — agent may be stuck in a retry loop`,
    });
  }

  if (metrics.unnecessaryReads >= 2) {
    suggestions.push({
      severity: "info",
      message: `${metrics.unnecessaryReads} unnecessary file re-reads — consider caching file contents`,
    });
  }

  const grepCount = metrics.toolCallsByName.grep ?? 0;
  if (grepCount >= 4) {
    suggestions.push({
      severity: "info",
      message: `grep called ${grepCount} times — search strategy may be inefficient`,
    });
  }

  if (metrics.contextPeakTokens > 100_000) {
    suggestions.push({
      severity: "warn",
      message: `High context usage (${metrics.contextPeakTokens.toLocaleString()} tokens) — compaction triggered ${metrics.compactions}x`,
    });
  }

  if (metrics.toolRounds >= 15) {
    suggestions.push({
      severity: "info",
      message: `${metrics.toolRounds} tool rounds — long-running task; verify progress tracking`,
    });
  }

  const readCount = metrics.toolCallsByName.read ?? 0;
  if (readCount >= 8) {
    suggestions.push({
      severity: "info",
      message: `read called ${readCount} times — high file read count`,
    });
  }

  return suggestions;
}
