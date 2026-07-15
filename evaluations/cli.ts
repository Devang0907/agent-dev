#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { parseArgs, printHelp } from "./runner/config.js";
import { listScenarios, getBaselinesDir, getReportsDir } from "./scenarios/registry.js";
import {
  runEvalSuite,
  buildEvalConfig,
  saveBaselines,
  compareToBaselines,
} from "./runner/runner.js";
import { printTerminalSummary } from "./reports/terminal.js";
import { writeJsonReport } from "./reports/json.js";
import { writeMarkdownReport, writeComparisonReport } from "./reports/markdown.js";
import { loadSettings } from "../src/config/settings.js";

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  if (parsed.help) {
    printHelp();
    return;
  }

  if (parsed.list) {
    listScenarios();
    return;
  }

  const modelRefs = (parsed as { modelRefs?: string[] }).modelRefs ?? [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir =
    parsed.outputDir ?? join(getReportsDir(), `${timestamp}-${getGitSha()}`);

  const config = buildEvalConfig(
    {
      tags: parsed.tags,
      scenarios: parsed.scenarios,
      approve: parsed.approve,
      seed: parsed.seed,
      timeoutMs: parsed.timeoutMs,
      parallel: parsed.parallel,
      verbose: parsed.verbose,
      baseline: parsed.baseline,
      compare: parsed.compare,
      settings: loadSettings(),
    },
    modelRefs,
  );

  console.log(chalk.bold("\nAgent Evaluation Suite"));
  console.log(chalk.gray(`Tags: ${config.tags.join(", ")}`));
  console.log(chalk.gray(`Report: ${reportDir}\n`));

  mkdirSync(reportDir, { recursive: true });

  if (!process.env.AGENT_MAX_TOOL_ROUNDS) {
    process.env.AGENT_MAX_TOOL_ROUNDS = "30";
  }

  const result = await runEvalSuite(config, modelRefs, reportDir);

  let comparisons;
  if (config.compare) {
    comparisons = compareToBaselines(result, getBaselinesDir());
  }

  if (config.baseline) {
    saveBaselines(result, getBaselinesDir());
    console.log(chalk.green(`Baselines saved to ${getBaselinesDir()}`));
  }

  writeJsonReport(reportDir, result, comparisons);
  writeMarkdownReport(reportDir, result, comparisons);
  if (result.modelRuns.length > 1) {
    writeComparisonReport(reportDir, result);
  }

  printTerminalSummary(result, comparisons);

  const totalFailed = result.modelRuns.reduce((sum, mr) => sum + mr.failed, 0);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
