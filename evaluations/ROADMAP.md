# Evaluation Roadmap

Status of evaluation scenarios mapped to the 25 evaluation categories.

| # | Category | Scenario ID | Status |
|---|----------|-------------|--------|
| 1 | Multi-step task completion | `rest-api-e2e` | Implemented |
| 2 | Wrong assumptions | `wrong-file-recovery` | Implemented (smoke) |
| 3 | Ambiguous instructions | `ambiguous-login` | Implemented (smoke) |
| 4 | Context retention | `long-conversation-30` | Implemented |
| 5 | Context switching | `task-abc-return-a` | Implemented |
| 6 | Agentic planning | `plan-revise-abandon` | Implemented |
| 7 | Recovery from failures | `retry-on-test-fail` | Implemented (smoke) |
| 8 | Infinite loop prevention | `loop-guard-deterministic` | Implemented (deterministic) |
| 9 | Tool selection | `tool-choice-git-status` | Implemented |
| 10 | Tool failure handling | `injected-read-failure` | Implemented |
| 11 | Shell command safety | `safety-destructive-cmd` | Implemented (smoke) |
| 12 | Hallucination resistance | `fake-api-investigation` | Implemented |
| 13 | Repository understanding | `grep-before-edit` | Implemented (smoke) |
| 14 | Large repository navigation | `large-repo-navigate` | Implemented |
| 15 | Editing quality | `minimal-diff-fix` | Implemented |
| 16 | Git workflow | `git-commit-quality` | Implemented |
| 17 | Conversation robustness | `requirement-pivot` | Implemented |
| 18 | Memory pressure | `context-compaction` | Planned |
| 19 | Long-running tasks | `many-tool-calls` | Implemented |
| 20 | Cost efficiency | (metrics on all runs) | Implemented |
| 21 | Performance metrics | (reports) | Implemented |
| 22 | Regression evaluations | `--baseline` / `--compare` | Implemented |
| 23 | LLM comparison | `--model` x N | Implemented |
| 24 | Deterministic evaluations | `deterministic/*` | Implemented |
| 25 | Benchmark scoring | RubricScorer | Implemented |

## Planned scenarios

### `context-compaction` (Category 18)

Seed 80+ turns to force compaction, verify key decisions survive in summary. Blocked on reliable compaction trigger in short eval windows.

### LLM-as-judge (future)

Interface reserved in `graders/types.ts`. Rule-based graders are used for v1. Future: optional `--judge-model` for subjective rubrics.

### Browser automation scenarios

Playwright-based scenarios for web app testing. Requires headless browser setup in eval isolation.

### Boss / multi-agent orchestration

Dedicated scenarios for `--boss` and `--multi` modes with delegation trace validation.

## Adding scenarios

See [README.md](./README.md) for the 5-step authoring guide. Prefer:

1. One scenario per behavioral concern
2. Rule-based graders with clear pass/fail signals
3. `smoke` tag only for fast, high-signal scenarios (< 2 min each)
4. `deterministic` tag for infrastructure and loop-guard tests
