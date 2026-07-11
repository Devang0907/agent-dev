import { runAgentLoop, type AgentEvent } from "../../src/agent/loop.js";
import type { Model } from "../../src/providers/types.js";
import type { EvalConfig } from "./config.js";
import type { EvalScenario, ScenarioResult } from "../scenarios/types.js";
import { createFixtureWorkspace } from "../fixtures/workspace.js";
import { streamChatFromScript, textThenDone } from "../lib/mock-stream.js";
import type { StreamScript } from "../lib/mock-stream.js";
import { sampleEvalSettings } from "../lib/settings.js";

export async function runDeterministicScenario(
  scenario: EvalScenario,
  model: Model,
  config: EvalConfig,
): Promise<ScenarioResult> {
  const workspace = createFixtureWorkspace();
  const start = Date.now();
  const events: AgentEvent[] = [];

  try {
    const artifacts = new Map<string, unknown>();
    const ctx = {
      workspace,
      session: null as never,
      events: events as never[],
      metrics: {
        toolCallsByName: {},
        toolRounds: 0,
        retries: 0,
        permissionRequests: 0,
        deniedCommands: 0,
        contextPeakTokens: 0,
        compactions: 0,
        wallTimeMs: 0,
        turnCount: 0,
        completionStatus: "completed" as const,
        unnecessaryReads: 0,
        planUpdates: 0,
        errors: 0,
        textLength: 0,
      },
      artifacts,
      model,
      settings: config.settings,
    };

    await scenario.setup(ctx);

    const scripts = ctx.artifacts.get("streamScripts") as StreamScript[] | undefined;
    const singleScript = ctx.artifacts.get("streamScript") as StreamScript | undefined;
    const scriptList = scripts ?? (singleScript ? [singleScript] : [textThenDone("done")]);

    let round = 0;

    await runAgentLoop({
      model,
      messages: [{ role: "user", content: "deterministic eval" }],
      settings: sampleEvalSettings(config.settings),
      workdir: workspace.path,
      sessionId: "eval-deterministic",
      onEvent: (e) => events.push(e),
      onPermissionRequest: async () => config.approve !== "deny",
      streamChatOverride: async function* () {
        const s = scriptList[Math.min(round, scriptList.length - 1)]!;
        round++;
        yield* streamChatFromScript(s)();
      },
    });

    const gradeCtx = {
      ...ctx,
      events: events as never[],
    };

    const grade = await scenario.grade(gradeCtx);

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: grade.passed ? "passed" : "failed",
      grade,
      metrics: gradeCtx.metrics,
      wallTimeMs: Date.now() - start,
    };
  } catch (err) {
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      metrics: {
        toolCallsByName: {},
        toolRounds: 0,
        retries: 0,
        permissionRequests: 0,
        deniedCommands: 0,
        contextPeakTokens: 0,
        compactions: 0,
        wallTimeMs: Date.now() - start,
        turnCount: 0,
        completionStatus: "error",
        unnecessaryReads: 0,
        planUpdates: 0,
        errors: 1,
        textLength: 0,
      },
      wallTimeMs: Date.now() - start,
    };
  } finally {
    workspace.cleanup();
  }
}
