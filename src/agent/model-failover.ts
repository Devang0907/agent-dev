import type { Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import { getAvailableModels } from "../providers/registry.js";
import { modelRef } from "../config/models.js";

/** Max automatic model switches within a single agent loop run. */
export const MAX_MODEL_FAILOVERS = 3;

/**
 * True when the error means the current model/provider cannot serve requests
 * right now (rate limit, quota, auth, dead model, provider outage) — i.e.
 * retrying the same model is pointless but another connected model may work.
 */
export function isModelUnavailableError(message: string): boolean {
  return (
    /\b429\b|rate.?limit|exceeded your current quota|insufficient_quota|tokens per minute|\(TPM\)|decommissioned|model_not_found|model .* does not exist|does not exist or you do not have access|\b401\b|invalid api key|incorrect api key|invalid x-api-key|authentication[_ ]error|Missing \w*API_KEY|\b(?:502|503|529)\b|service unavailable|overloaded/i.test(
      message,
    )
  );
}

/**
 * Pick the next connected model to fail over to. Prefers a different provider
 * (rate limits and quota are usually provider-wide), then falls back to other
 * models on the same provider (per-model limits, e.g. Groq TPM tiers).
 */
export function pickFallbackModel(
  current: Model,
  failedRefs: ReadonlySet<string>,
  settings: Settings,
): Model | null {
  const candidates = getAvailableModels(settings).filter(
    (m) => !failedRefs.has(modelRef(m)) && modelRef(m) !== modelRef(current),
  );
  if (candidates.length === 0) return null;
  return candidates.find((m) => m.provider !== current.provider) ?? candidates[0] ?? null;
}
