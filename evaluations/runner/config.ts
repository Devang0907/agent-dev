import type { Model } from "../../src/providers/types.js";
import type { Settings } from "../../src/config/settings.js";
import type { ApprovalPolicy } from "../mocks/approval-policy.js";

export interface EvalConfig {
  tags: string[];
  scenarios: string[];
  models: Model[];
  outputDir: string;
  seed?: number;
  approve: ApprovalPolicy;
  timeoutMs?: number;
  parallel: number;
  verbose: boolean;
  list: boolean;
  baseline: boolean;
  compare: boolean;
  settings: Settings;
}

export function parseArgs(argv: string[]): Partial<EvalConfig> & { help?: boolean } {
  const result: Partial<EvalConfig> & { help?: boolean } = {
    tags: ["smoke"],
    scenarios: [],
    models: [],
    approve: "selective",
    parallel: 1,
    verbose: false,
    list: false,
    baseline: false,
    compare: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        result.help = true;
        break;
      case "--tag":
        result.tags = (argv[++i] ?? "smoke").split(",");
        break;
      case "--scenario":
        result.scenarios!.push(argv[++i] ?? "");
        break;
      case "--model":
        result.models!.push({} as Model); // resolved later
        result.models![result.models!.length - 1] = { provider: "free", id: "", name: "" };
        // store raw ref for later resolution
        (result as { modelRefs?: string[] }).modelRefs ??= [];
        (result as { modelRefs?: string[] }).modelRefs!.push(argv[++i] ?? "");
        break;
      case "--output":
        result.outputDir = argv[++i];
        break;
      case "--seed":
        result.seed = Number(argv[++i]);
        break;
      case "--approve":
        result.approve = (argv[++i] ?? "selective") as ApprovalPolicy;
        break;
      case "--timeout":
        result.timeoutMs = Number(argv[++i]);
        break;
      case "--parallel":
        result.parallel = Number(argv[++i]) || 1;
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--list":
        result.list = true;
        break;
      case "--baseline":
        result.baseline = true;
        break;
      case "--compare":
        result.compare = true;
        break;
    }
  }

  return result;
}

export function printHelp(): void {
  console.log(`
Agent Evaluation Suite

Usage:
  npm run eval                              Run smoke scenarios (default)
  npm run eval:full                         Run full scenario suite
  npm run eval:deterministic                  Run deterministic scenarios (no API keys)
  npm run eval -- --list                      List available scenarios
  npm run eval -- --scenario <id>             Run specific scenario
  npm run eval -- --model provider/model-id   Model to evaluate (repeatable)
  npm run eval -- --tag smoke|full|deterministic
  npm run eval -- --compare                   Compare against baselines
  npm run eval -- --baseline                  Save results as baselines
  npm run eval -- --approve auto|deny|selective
  npm run eval -- --output <dir>              Report output directory
  npm run eval -- --verbose                   Verbose output

Note: Live scenarios require API keys. Not run in CI.
`);
}
