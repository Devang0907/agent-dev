# Agent Evaluation Suite

Optional, expensive **real-world agent evaluations** for Agent Dev. This is separate from the unit/integration test suite (`npm test`) and is **not run in CI**.

## Quick start

```bash
# Requires API keys for live scenarios
export GROQ_API_KEY=gsk_...   # or OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.

npm run eval                    # Smoke scenarios (~5, default)
npm run eval:full               # Full scenario suite
npm run eval:deterministic      # No API keys needed (mock streams)
npm run eval -- --list          # List all scenarios
```

## CLI options

| Flag | Description |
|------|-------------|
| `--tag smoke\|full\|deterministic` | Filter scenarios by tag (default: `smoke`) |
| `--scenario <id>` | Run a specific scenario (repeatable) |
| `--model provider/model-id` | Model to evaluate (repeatable for comparison) |
| `--compare` | Compare results against `evaluations/baselines/` |
| `--baseline` | Save current results as baselines |
| `--approve auto\|deny\|selective` | Permission policy (default: `selective`) |
| `--output <dir>` | Custom report directory |
| `--verbose` | Verbose output |
| `--list` | List scenarios |

## Reports

Each run writes to `evaluations/reports/<timestamp>-<git-sha>/`:

- `summary.json` — machine-readable results
- `report.md` — human-readable summary
- `comparison.md` — multi-model comparison (when using multiple `--model` flags)

## Rubric dimensions

| Dimension | What it measures |
|-----------|------------------|
| Planning | Task ordering, plan tool usage |
| Reasoning | Search before edit, clarification |
| Recovery | Retry behavior, strategy changes |
| ToolSelection | Correct tool for the job |
| ContextRetention | Memory across turns |
| Execution | Task completion, artifacts |
| Safety | Dangerous command handling |

## Authoring a scenario

### 1. Create a scenario file

Place under `evaluations/scenarios/smoke/`, `full/`, or `deterministic/`:

```typescript
import type { EvalScenario } from "../types.js";

export const myScenario: EvalScenario = {
  id: "my-scenario",
  title: "My Scenario",
  tags: ["smoke"],
  description: "What this tests",
  rubric: ["Execution", "Reasoning"],
  timeoutMs: 120_000,

  async setup(ctx) {
    // Write files to ctx.workspace.path
  },

  turns: [{ prompt: "Do something in the workspace." }],

  async grade(ctx) {
    return {
      passed: true,
      score: 100,
      rubric: { Execution: 100 },
      checks: [{ name: "did the thing", passed: true }],
    };
  },
};
```

### 2. Register in `evaluations/scenarios/registry.ts`

Import and add to `ALL_SCENARIOS`.

### 3. Run locally

```bash
npm run eval -- --scenario my-scenario --verbose
```

## Deterministic scenarios

For infrastructure validation without API keys, use `tags: ["deterministic"]` and set a mock stream in `setup`:

```typescript
import { textThenDone } from "../../lib/mock-stream.js";

async setup(ctx) {
  ctx.artifacts.set("streamScript", textThenDone("done"));
}
```

## Multi-model comparison

```bash
npm run eval -- --model anthropic/claude-sonnet-4-6 --model openai/gpt-4o --model groq/llama-3.3-70b-versatile
```

## Baselines

Save results for regression tracking:

```bash
npm run eval -- --baseline
npm run eval -- --compare    # diff against saved baselines
```

## Architecture

```
evaluations/
  cli.ts              Entry point
  runner/             EvalHarness, runner, isolation
  scenarios/          Scenario definitions
  graders/            Rule-based scoring
  metrics/            Tool/token/cost metrics
  reports/            Terminal, JSON, Markdown output
  mocks/              Approval policies, tool interceptors
  fixtures/           Workspace helpers and generators
  baselines/          Saved baseline scores
  reports/            Generated run reports (gitignored)
```

## Cost warning

Live scenarios make real LLM API calls and may run shell commands in isolated temp directories. Always review scenarios before running. Never point eval workspaces at your real project root.
