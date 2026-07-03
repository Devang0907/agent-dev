import type { Model } from "../../providers/types.js";
import type { Settings } from "../../config/settings.js";
import { parseModelRef, modelRef } from "../../config/models.js";
import { getAvailableModels } from "../../providers/registry.js";
import type { AgentEffort } from "./agents.js";

const SMALL_MODEL_TOKENS = new Set([
  "mini",
  "flash",
  "nano",
  "lite",
  "instant",
  "small",
  "1b",
  "3b",
  "7b",
  "8b",
  "9b",
]);

/** Heuristic size tier used to pick per-effort defaults. */
export function isSmallModel(model: Model): boolean {
  // Token-based so "gemini" does not match "mini".
  const tokens = `${model.id} ${model.name}`.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.some((t) => SMALL_MODEL_TOKENS.has(t));
}

export interface ModelResolution {
  model: Model;
  /** Present when a requested model was rejected and a fallback was used. */
  warning?: string;
}

function defaultForEffort(effort: AgentEffort, available: Model[], fallback: Model): Model {
  if (available.length === 0) return fallback;
  if (effort === "low") {
    return available.find(isSmallModel) ?? available[0]!;
  }
  return available.find((m) => !isSmallModel(m)) ?? available[0]!;
}

/**
 * Resolve the model a spawned agent should use. Only models whose provider is
 * connected (has an API key) are ever returned; invalid or unavailable
 * requests fall back to an effort-based default with a warning.
 */
export function resolveAgentModel(
  requestedRef: string | undefined,
  effort: AgentEffort,
  settings: Settings,
  bossModel: Model,
): ModelResolution {
  const available = getAvailableModels(settings);

  if (requestedRef?.trim()) {
    const requested = parseModelRef(requestedRef.trim());
    if (
      requested &&
      available.some((m) => m.provider === requested.provider && m.id === requested.id)
    ) {
      return { model: requested };
    }
    const fallback = defaultForEffort(effort, available, bossModel);
    return {
      model: fallback,
      warning: `Requested model "${requestedRef}" is not available (unknown, or provider not connected). Using ${modelRef(fallback)} instead.`,
    };
  }

  return { model: defaultForEffort(effort, available, bossModel) };
}

/** Model list injected into the multi-boss prompt so it only assigns connected models. */
export function formatModelCatalog(settings: Settings): string {
  const available = getAvailableModels(settings);
  if (available.length === 0) return "(no models connected — configure an API key first)";
  return available
    .map((m) => `- ${modelRef(m)} (${isSmallModel(m) ? "small/fast" : "large/capable"})`)
    .join("\n");
}
