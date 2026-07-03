import { afterEach, describe, expect, it } from "vitest";
import { executeSpawnAgents } from "../../../src/agent/multi-agent/tools/spawn-agents.js";
import {
  setMultiAgentContext,
  createClaimRegistry,
  MAX_SPAWNS_PER_TURN,
} from "../../../src/agent/multi-agent/context.js";
import type { MultiAgentContext } from "../../../src/agent/multi-agent/context.js";
import type { runAgentLoop } from "../../../src/agent/loop.js";
import type { Settings } from "../../../src/config/settings.js";
import type { Model, ChatMessage } from "../../../src/providers/types.js";
import { createTmpWorkspace, type TmpWorkspace } from "../../fixtures/tmp-workspace.js";

const BOSS_MODEL: Model = {
  provider: "free",
  id: "test/boss-model",
  name: "Boss",
  contextWindow: 32_000,
};

const SETTINGS: Settings = {
  defaultProvider: "free",
  defaultModel: "test/boss-model",
  thinkingLevel: "off",
};

let workspace: TmpWorkspace | null = null;

function makeContext(overrides?: Partial<MultiAgentContext>): MultiAgentContext {
  workspace = createTmpWorkspace();
  const ctx: MultiAgentContext = {
    sessionId: "test-session",
    bossModel: BOSS_MODEL,
    settings: SETTINGS,
    workdir: workspace.path,
    onEvent: () => {},
    customAgents: null,
    claims: createClaimRegistry(workspace.path),
    spawnCount: 0,
    maxSpawnsPerTurn: MAX_SPAWNS_PER_TURN,
    maxParallel: 3,
    ...overrides,
  };
  setMultiAgentContext(ctx);
  return ctx;
}

function delayedRunner(delayMs: number, tracker: { active: number; maxActive: number }) {
  return (async () => {
    tracker.active++;
    tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
    await new Promise((r) => setTimeout(r, delayMs));
    tracker.active--;
    return [{ role: "assistant", content: "task done" }] as ChatMessage[];
  }) as unknown as typeof runAgentLoop;
}

afterEach(() => {
  setMultiAgentContext(null);
  workspace?.cleanup();
  workspace = null;
});

describe("executeSpawnAgents validation", () => {
  it("errors outside multi-agent mode", async () => {
    setMultiAgentContext(null);
    const result = await executeSpawnAgents({
      tasks: [{ agent: "scout", task: "look around" }],
    });
    expect(result).toMatch(/only available in multi-agent/);
  });

  it("rejects an empty task list", async () => {
    makeContext();
    expect(await executeSpawnAgents({ tasks: [] })).toMatch(/non-empty/);
  });

  it("rejects unknown agents", async () => {
    makeContext();
    const result = await executeSpawnAgents({
      tasks: [{ agent: "wizard", task: "cast spell" }],
    });
    expect(result).toMatch(/unknown agent "wizard"/);
  });

  it("requires files_touched for writing agents", async () => {
    makeContext();
    const result = await executeSpawnAgents({
      tasks: [{ agent: "implementer", task: "edit stuff" }],
    });
    expect(result).toMatch(/must declare files_touched/);
  });

  it("rejects overlapping files_touched scopes within a batch", async () => {
    makeContext();
    const result = await executeSpawnAgents({
      tasks: [
        { agent: "implementer", task: "task A", files_touched: ["src/a.ts", "src/shared.ts"] },
        { agent: "implementer", task: "task B", files_touched: ["SRC\\shared.ts"] },
      ],
    });
    expect(result).toMatch(/file scope conflict/i);
  });

  it("enforces the per-turn spawn limit", async () => {
    const ctx = makeContext();
    ctx.spawnCount = ctx.maxSpawnsPerTurn;
    const result = await executeSpawnAgents({
      tasks: [{ agent: "scout", task: "explore" }],
    });
    expect(result).toMatch(/spawn limit reached/);
  });
});

describe("executeSpawnAgents parallel dispatch", () => {
  it("runs independent tasks concurrently", async () => {
    const tracker = { active: 0, maxActive: 0 };
    makeContext({ loopRunner: delayedRunner(50, tracker), maxParallel: 3 });

    const result = await executeSpawnAgents({
      tasks: [
        { agent: "scout", task: "explore module A" },
        { agent: "scout", task: "explore module B" },
        { agent: "scout", task: "explore module C" },
      ],
    });

    expect(tracker.maxActive).toBeGreaterThanOrEqual(2);
    expect(result).toMatch(/Spawned 3 agent\(s\)/);
    expect(result.match(/scout #/g)?.length).toBe(3);
  });

  it("caps concurrency at maxParallel", async () => {
    const tracker = { active: 0, maxActive: 0 };
    makeContext({ loopRunner: delayedRunner(30, tracker), maxParallel: 2 });

    await executeSpawnAgents({
      tasks: [
        { agent: "scout", task: "one" },
        { agent: "scout", task: "two" },
        { agent: "scout", task: "three" },
        { agent: "scout", task: "four" },
      ],
    });

    expect(tracker.maxActive).toBeLessThanOrEqual(2);
  });

  it("emits delegation start/end events with the model used", async () => {
    const events: string[] = [];
    makeContext({
      loopRunner: delayedRunner(5, { active: 0, maxActive: 0 }),
      onEvent: (event) => {
        if (event.type === "delegation_start" || event.type === "delegation_end") {
          events.push(`${event.type}:${event.workerId}:${event.model ?? "?"}`);
        }
      },
    });

    await executeSpawnAgents({
      tasks: [{ agent: "scout", task: "explore" }],
    });

    expect(events.some((e) => e.startsWith("delegation_start:scout:"))).toBe(true);
    expect(events.some((e) => e.startsWith("delegation_end:scout:"))).toBe(true);
  });

  it("includes the audit path for writing agents", async () => {
    makeContext({ loopRunner: delayedRunner(5, { active: 0, maxActive: 0 }) });

    const result = await executeSpawnAgents({
      tasks: [{ agent: "implementer", task: "edit", files_touched: ["src/a.ts"] }],
    });

    expect(result).toMatch(/Audit: \.agent-dev\/multi-agent\/test-session\/.+-audit\.md/);
  });

  it("releases file claims after runs finish", async () => {
    const ctx = makeContext({ loopRunner: delayedRunner(5, { active: 0, maxActive: 0 }) });

    await executeSpawnAgents({
      tasks: [{ agent: "implementer", task: "edit", files_touched: ["src/a.ts"] }],
    });

    expect(ctx.claims.claim("later-run", ["src/a.ts"]).ok).toBe(true);
  });

  it("reports per-task failures without failing the batch", async () => {
    let call = 0;
    const runner = (async () => {
      call++;
      if (call === 1) throw new Error("worker exploded");
      return [{ role: "assistant", content: "ok" }] as ChatMessage[];
    }) as unknown as typeof runAgentLoop;
    makeContext({ loopRunner: runner, maxParallel: 1 });

    const result = await executeSpawnAgents({
      tasks: [
        { agent: "scout", task: "will fail" },
        { agent: "scout", task: "will pass" },
      ],
    });

    expect(result).toMatch(/error/);
    expect(result).toMatch(/worker exploded/);
    expect(result).toMatch(/success/);
  });
});
