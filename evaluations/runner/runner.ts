import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvalConfig } from "./config.js";
import type { EvalScenario, ScenarioResult } from "../scenarios/types.js";
import { filterScenarios } from "../scenarios/registry.js";
import { EvalHarness } from "./harness.js";
import { createIsolationContext } from "./isolation.js";
import { createFixtureWorkspace } from "../fixtures/workspace.js";
import { loadSettings } from "../../src/config/settings.js";
import { getAvailableModels, hasProviderAuth } from "../../src/providers/registry.js";
import { parseModelRef, modelRef } from "../../src/config/models.js";
import type { Model } from "../../src/providers/types.js";
import { runDeterministicScenario } from "./deterministic-runner.js";
import { createToolInterceptor } from "../mocks/tool-interceptor.js";

export interface ModelRunResult {
  model: Model;
  modelRef: string;
  scenarios: ScenarioResult[];
  overallScore: number;
  passed: number;
  failed: number;
  skipped: number;
  reportDir: string;
}

export interface EvalRunResult {
  runId: string;
  startedAt: string;
  config: Pick<EvalConfig, "tags" | "approve" | "seed">;
  modelRuns: ModelRunResult[];
}

function resolveModels(config: EvalConfig, modelRefs: string[]): Model[] {
  const settings = config.settings;
  const available = getAvailableModels(settings);

  if (modelRefs.length === 0) {
    const fromSettings = available.find(
      (m) => m.provider === settings.defaultProvider && m.id === settings.defaultModel,
    );
    return [fromSettings ?? available[0]!].filter(Boolean);
  }

  const models: Model[] = [];
  for (const ref of modelRefs) {
    const model = parseModelRef(ref);
    if (!model) {
      console.warn(`Unknown model ref: ${ref}`);
      continue;
    }
    if (!hasProviderAuth(model.provider, settings)) {
      console.warn(`No API key for ${ref} — skipping`);
      continue;
    }
    models.push(model);
  }
  return models;
}

async function runLiveScenario(
  scenario: EvalScenario,
  model: Model,
  config: EvalConfig,
): Promise<ScenarioResult> {
  const isolation = createIsolationContext();
  const workspace = createFixtureWorkspace();
  const start = Date.now();

  try {
    const harness = new EvalHarness(workspace, config.settings, model, config.approve);
    const session = harness.createSession();

    if (scenario.modes?.includes("plan")) {
      session.setAgentMode("plan");
    } else if (scenario.modes?.includes("boss")) {
      session.setOrchestratorMode("boss");
    } else if (scenario.modes?.includes("multi")) {
      session.setOrchestratorMode("multi");
    }

    const ctx = harness.buildContext(session);
    await scenario.setup(ctx);

    if (scenario.id === "injected-read-failure") {
      harness.setToolExecuteHook(
        createToolInterceptor([
          {
            tool: "read",
            match: (args) => args.path === "target.txt",
            failCount: 1,
            errorMessage: "Error: simulated read failure",
          },
        ]),
      );
      session.setToolExecuteHook(
        createToolInterceptor([
          {
            tool: "read",
            match: (args) => args.path === "target.txt",
            failCount: 1,
            errorMessage: "Error: simulated read failure",
          },
        ]),
      );
    }

    const turns = typeof scenario.turns === "function" ? await scenario.turns(ctx) : scenario.turns;
    const timeout = scenario.timeoutMs ?? config.timeoutMs ?? (scenario.tags.includes("smoke") ? 120_000 : 600_000);

    await harness.runTurns(session, turns, timeout);

    const finalCtx: typeof ctx = {
      ...harness.buildContext(session),
      metrics: harness.getResult(turns.length).metrics,
    };

    const grade = await scenario.grade(finalCtx);
    const metrics = harness.getResult(turns.length).metrics;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: grade.passed ? "passed" : "failed",
      grade,
      metrics,
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
    isolation.cleanup();
  }
}

export async function runEvalSuite(
  config: EvalConfig,
  modelRefs: string[],
  reportDir: string,
): Promise<EvalRunResult> {
  const scenarios = filterScenarios({ tags: config.tags, ids: config.scenarios });
  const models = resolveModels(config, modelRefs);

  if (models.length === 0) {
    throw new Error("No models available. Set API keys or use --tag deterministic.");
  }

  mkdirSync(reportDir, { recursive: true });

  const runId = reportDir.split(/[/\\]/).pop() ?? "eval-run";
  const modelRuns: ModelRunResult[] = [];

  for (const model of models) {
    const mRef = modelRef(model);
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      if (config.verbose) {
        console.log(`  Running ${scenario.id} with ${mRef}...`);
      }

      let result: ScenarioResult;
      if (scenario.tags.includes("deterministic")) {
        result = await runDeterministicScenario(scenario, model, config);
      } else {
        result = await runLiveScenario(scenario, model, config);
      }

      scenarioResults.push(result);

      // Write per-scenario trace for live scenarios
      if (!scenario.tags.includes("deterministic")) {
        const traceDir = join(reportDir, mRef.replace("/", "-"));
        mkdirSync(traceDir, { recursive: true });
        writeFileSync(
          join(traceDir, `${scenario.id}.json`),
          JSON.stringify(result, null, 2),
        );
      }
    }
    const passed = scenarioResults.filter((r) => r.status === "passed").length;
    const failed = scenarioResults.filter((r) => r.status === "failed" || r.status === "error").length;
    const skipped = scenarioResults.filter((r) => r.status === "skipped").length;
    const scores = scenarioResults.filter((r) => r.grade).map((r) => r.grade!.score);
    const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    modelRuns.push({
      model,
      modelRef: mRef,
      scenarios: scenarioResults,
      overallScore,
      passed,
      failed,
      skipped,
      reportDir: join(reportDir, mRef.replace("/", "-")),
    });
  }

  return {
    runId,
    startedAt: new Date().toISOString(),
    config: { tags: config.tags, approve: config.approve, seed: config.seed },
    modelRuns,
  };
}

export function buildEvalConfig(partial: Partial<EvalConfig>, modelRefs: string[]): EvalConfig {
  const settings = partial.settings ?? loadSettings();
  return {
    tags: partial.tags ?? ["smoke"],
    scenarios: partial.scenarios ?? [],
    models: [],
    outputDir: partial.outputDir ?? "",
    seed: partial.seed,
    approve: partial.approve ?? "selective",
    timeoutMs: partial.timeoutMs,
    parallel: partial.parallel ?? 1,
    verbose: partial.verbose ?? false,
    list: partial.list ?? false,
    baseline: partial.baseline ?? false,
    compare: partial.compare ?? false,
    settings,
  };
}

export function saveBaselines(result: EvalRunResult, baselinesDir: string): void {
  mkdirSync(baselinesDir, { recursive: true });
  for (const mr of result.modelRuns) {
    for (const sr of mr.scenarios) {
      if (!sr.grade) continue;
      const filename = `${sr.scenarioId}__${mr.modelRef.replace("/", "-")}.json`;
      writeFileSync(
        join(baselinesDir, filename),
        JSON.stringify({
          scenarioId: sr.scenarioId,
          modelRef: mr.modelRef,
          score: sr.grade.score,
          rubric: sr.grade.rubric,
          recordedAt: new Date().toISOString(),
          metrics: {
            toolRounds: sr.metrics.toolRounds,
            wallTimeMs: sr.metrics.wallTimeMs,
            retries: sr.metrics.retries,
          },
        }, null, 2),
      );
    }
  }
}

export interface BaselineComparison {
  scenarioId: string;
  modelRef: string;
  currentScore: number;
  baselineScore: number;
  delta: number;
  status: "improved" | "regressed" | "unchanged" | "no-baseline";
}

export function compareToBaselines(result: EvalRunResult, baselinesDir: string): BaselineComparison[] {
  const comparisons: BaselineComparison[] = [];

  for (const mr of result.modelRuns) {
    for (const sr of mr.scenarios) {
      if (!sr.grade) continue;
      const filename = `${sr.scenarioId}__${mr.modelRef.replace("/", "-")}.json`;
      const baselinePath = join(baselinesDir, filename);

      if (!existsSync(baselinePath)) {
        comparisons.push({
          scenarioId: sr.scenarioId,
          modelRef: mr.modelRef,
          currentScore: sr.grade.score,
          baselineScore: 0,
          delta: 0,
          status: "no-baseline",
        });
        continue;
      }

      const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { score: number };
      const delta = sr.grade.score - baseline.score;
      comparisons.push({
        scenarioId: sr.scenarioId,
        modelRef: mr.modelRef,
        currentScore: sr.grade.score,
        baselineScore: baseline.score,
        delta,
        status: delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged",
      });
    }
  }

  return comparisons;
}

export function listBaselines(baselinesDir: string): string[] {
  if (!existsSync(baselinesDir)) return [];
  return readdirSync(baselinesDir).filter((f) => f.endsWith(".json"));
}
