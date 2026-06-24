# Agent-Dev Test Guide

## Running tests

```bash
bun run test              # run once
bun run test:watch        # watch mode
bun run test:coverage     # with coverage report
```

## Isolation

- `test/setup.ts` sets `AGENT_DEV_DIR` to a fresh temp directory per test.
- API keys are cleared so tests never hit live providers.
- Use `createTmpWorkspace()` from `test/fixtures/tmp-workspace.ts` for project files.

## Layout

Mirror `src/` under `test/`:

- `test/providers/` — provider compatibility helpers
- `test/agent/` — loop, session, mode, system prompt
- `test/tools/` — tool integration with temp fs / mocked spawn
- `test/regression/` — bugs we must not reintroduce

## Agent loop tests

Use `test/lib/mock-stream.ts` and `test/lib/run-loop.ts` with scripted `StreamEvent`s.
Never call live LLM APIs in CI.

## Naming

Use behavior-driven names: `agent-loop-permission-denied.test.ts`, not `loop2.test.ts`.

Use `it.each` for table-driven cases when inputs are pure data.

## Adding a new test

1. Pick the tier: unit (pure), tool integration (fs/spawn), or loop integration (mock stream).
2. Place the file under the matching `test/` subdirectory.
3. Import from `../../src/...js` paths (Vitest resolves `.ts` source).
4. Prefer readiness signals over `setTimeout` sleeps.
