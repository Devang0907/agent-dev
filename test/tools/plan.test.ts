import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getPlanPath } from "../../src/config/paths.js";
import {
  clearPlan,
  executePlan,
  loadPlanSummary,
  planPathForSession,
  clearLegacyGlobalPlan,
} from "../../src/agent/tools/plan.js";

const SESSION_A = "session-a-111";
const SESSION_B = "session-b-222";

describe("session-scoped plan", () => {
  it("creates and lists plan", async () => {
    const result = await executePlan(
      {
        action: "create",
        title: "My Plan",
        tasks: ["first", "second"],
      },
      SESSION_A,
    );
    expect(result).toContain("Plan created");
    expect(result).toContain("→ [1]");
    expect(loadPlanSummary(SESSION_A)).toContain("My Plan");
  });

  it("isolates plans per session", async () => {
    await executePlan(
      { action: "create", title: "My Plan", tasks: ["first", "second"] },
      SESSION_A,
    );
    await executePlan({ action: "create", title: "B", tasks: ["only b"] }, SESSION_B);
    expect(loadPlanSummary(SESSION_A)).toContain("My Plan");
    expect(loadPlanSummary(SESSION_B)).toContain("Plan: B");
  });

  it("completes task and advances in_progress", async () => {
    await executePlan(
      { action: "create", title: "My Plan", tasks: ["first", "second"] },
      SESSION_A,
    );
    const result = await executePlan({ action: "complete", task_id: "1" }, SESSION_A);
    expect(result).toContain("✓ [1]");
    expect(result).toContain("→ [2]");
  });

  it("clears plan for session", async () => {
    await executePlan({ action: "create", tasks: ["x"] }, SESSION_A);
    await executePlan({ action: "clear" }, SESSION_A);
    expect(loadPlanSummary(SESSION_A)).toBe("");
  });

  it("migrates legacy global plan once", async () => {
    mkdirSync(join(process.env.AGENT_DEV_DIR!), { recursive: true });
    writeFileSync(
      getPlanPath(),
      JSON.stringify({
        title: "Legacy",
        tasks: [{ id: "1", content: "old", status: "in_progress" }],
        updatedAt: new Date().toISOString(),
      }),
    );
    const summary = loadPlanSummary("migrate-session");
    expect(summary).toContain("Legacy");
    expect(existsSync(getPlanPath())).toBe(false);
    expect(existsSync(planPathForSession("migrate-session"))).toBe(true);
  });

  it("clearLegacyGlobalPlan removes global file", () => {
    mkdirSync(join(process.env.AGENT_DEV_DIR!), { recursive: true });
    writeFileSync(getPlanPath(), "{}");
    clearLegacyGlobalPlan();
    expect(existsSync(getPlanPath())).toBe(false);
  });

  it("clearPlan removes session file", async () => {
    await executePlan({ action: "create", tasks: ["x"] }, "to-clear");
    clearPlan("to-clear");
    expect(loadPlanSummary("to-clear")).toBe("");
  });
});
