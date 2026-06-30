import type { AgentSession } from "../../agent/session.js";
import type { AgentMode } from "../../agent/mode.js";
import type { OrchestratorMode } from "../../config/settings.js";
import { parseModelRef, modelRef, PROVIDER_LABELS } from "../../config/models.js";
import type { Model } from "../../providers/types.js";
import { logGateway } from "./logger.js";

export function formatModeStatus(session: AgentSession): string {
  const agentMode = session.getAgentMode();
  const orchestrator = session.getOrchestratorMode();
  const boss = orchestrator === "boss" ? "on" : "off";
  return `Agent mode: ${agentMode}\nBoss mode: ${boss}`;
}

export function applyAgentMode(session: AgentSession, mode: AgentMode): string {
  const wasBoss = session.getOrchestratorMode() === "boss";
  session.switchToAgentMode(mode);
  logGateway(`Agent mode → ${mode}${wasBoss ? " (boss off)" : ""}`);
  return wasBoss
    ? `Boss orchestrator **disabled**. Switched to **${mode}** mode.`
    : `Switched to **${mode}** mode.`;
}

export function applyBossMode(session: AgentSession, mode: OrchestratorMode): string {
  session.setOrchestratorMode(mode);
  logGateway(`Boss mode → ${mode}`);
  return mode === "boss"
    ? "Boss orchestrator mode **enabled**."
    : "Boss orchestrator mode **disabled**.";
}

export function toggleBossMode(session: AgentSession): string {
  const next = session.getOrchestratorMode() === "boss" ? "off" : "boss";
  return applyBossMode(session, next);
}

export function formatModelList(session: AgentSession): string {
  const models = session.getAvailableModels();
  if (models.length === 0) {
    return "No models available. Configure an API key in ~/.agent-dev/settings.json";
  }

  const current = session.getModel();
  const byProvider = new Map<string, Model[]>();
  for (const m of models) {
    const list = byProvider.get(m.provider) ?? [];
    list.push(m);
    byProvider.set(m.provider, list);
  }

  const lines = [
    `Current: ${modelRef(current)}`,
    "",
    "Use /model provider/model-id to switch:",
  ];

  for (const [provider, providerModels] of byProvider) {
    lines.push(`\n${PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider}:`);
    for (const m of providerModels) {
      const ref = modelRef(m);
      const marker = ref === modelRef(current) ? " *" : "";
      lines.push(`  ${ref}${marker}`);
    }
  }

  return lines.join("\n");
}

export function applyCompact(
  session: AgentSession,
  instructions?: string,
): Promise<string> {
  return session.compact({ reason: "manual", customInstructions: instructions }).then((result) => {
    if (result.ok) {
      logGateway("Context compacted");
      return result.message;
    }
    return result.message;
  });
}

export function formatContextStatus(session: AgentSession): string {
  const usage = session.getContextUsage();
  return `Context: ${usage.tokens.toLocaleString()} / ${usage.window.toLocaleString()} tokens (${usage.percent}%)`;
}

export function applyModel(session: AgentSession, ref: string): string {
  const model = parseModelRef(ref.trim());
  if (!model) {
    return `Unknown model: ${ref}\n\nUse /model to list available models.`;
  }

  const available = session.getAvailableModels();
  const found = available.find((m) => m.provider === model.provider && m.id === model.id);
  if (!found) {
    return `Model not available (check API key): ${ref}\n\nUse /model to list available models.`;
  }

  session.setModel(found);
  logGateway(`Model → ${modelRef(found)}`);
  return `Model set to **${modelRef(found)}** (${found.name}).`;
}

export function parseBossArg(arg: string | undefined): OrchestratorMode | "toggle" {
  if (!arg) return "toggle";
  const lower = arg.toLowerCase();
  if (lower === "on" || lower === "enable" || lower === "true") return "boss";
  if (lower === "off" || lower === "disable" || lower === "false") return "off";
  return "toggle";
}
