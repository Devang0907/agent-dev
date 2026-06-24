import { describe, expect, it } from "vitest";
import { AgentSession } from "../../src/agent/session.js";
import { SessionManager } from "../../src/session/manager.js";
import { executePlan, loadPlanSummary, clearLegacyGlobalPlan } from "../../src/agent/tools/plan.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { getPlanPath } from "../../src/config/paths.js";
import { join } from "node:path";

describe("plan session scope regression", () => {
  it("new session does not inherit global plan", async () => {
    mkdirSync(process.env.AGENT_DEV_DIR!, { recursive: true });
    writeFileSync(
      getPlanPath(),
      JSON.stringify({
        title: "Stale Ride Sharing App",
        tasks: [{ id: "1", content: "Research", status: "in_progress" }],
        updatedAt: new Date().toISOString(),
      }),
    );

    const ws = createTmpWorkspace();
    const session = new AgentSession(sampleSettings(), new SessionManager(undefined, ws.path), ws.path);
    session.newSession();
    clearLegacyGlobalPlan();

    expect(existsSync(getPlanPath())).toBe(false);
    expect(loadPlanSummary(session.getSessionId())).toBe("");
    ws.cleanup();
  });

  it("/tasks clear semantics via clearPlan", async () => {
    const ws = createTmpWorkspace();
    const session = new AgentSession(sampleSettings(), new SessionManager(undefined, ws.path), ws.path);
    await executePlan(
      { action: "create", title: "Ride Sharing App", tasks: ["Research"] },
      session.getSessionId(),
    );
    await executePlan({ action: "clear" }, session.getSessionId());
    expect(loadPlanSummary(session.getSessionId())).toBe("");
    ws.cleanup();
  });
});
