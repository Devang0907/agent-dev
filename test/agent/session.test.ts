import { describe, expect, it } from "vitest";
import { AgentSession } from "../../src/agent/session.js";
import { SessionManager } from "../../src/session/manager.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";
import { executePlan, loadPlanSummary } from "../../src/agent/tools/plan.js";

describe("AgentSession", () => {
  it("emits mode change events", () => {
    const ws = createTmpWorkspace();
    const session = new AgentSession(sampleSettings(), new SessionManager(undefined, ws.path), ws.path);
    const events: string[] = [];
    session.on("event", (e) => {
      if (e.type === "agent_mode_changed") events.push(e.mode);
    });
    session.setAgentMode("plan");
    expect(events).toEqual(["plan"]);
    ws.cleanup();
  });

  it("disables boss orchestrator when switching to plan or build", () => {
    const ws = createTmpWorkspace();
    const session = new AgentSession(
      sampleSettings({ orchestratorMode: "boss" }),
      new SessionManager(undefined, ws.path),
      ws.path,
    );
    session.setAgentMode("plan");
    expect(session.getOrchestratorMode()).toBe("off");
    expect(session.getAgentMode()).toBe("plan");

    session.setOrchestratorMode("boss");
    session.setAgentMode("build");
    expect(session.getOrchestratorMode()).toBe("off");
    expect(session.getAgentMode()).toBe("build");
    ws.cleanup();
  });

  it("newSession clears messages", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    const session = new AgentSession(sampleSettings(), mgr, ws.path);
    session.newSession();
    expect(session.getMessages()).toHaveLength(0);
    ws.cleanup();
  });

  it("isolates plan per session after newSession", async () => {
    const ws = createTmpWorkspace();
    const session = new AgentSession(sampleSettings(), new SessionManager(undefined, ws.path), ws.path);
    const oldId = session.getSessionId();
    await executePlan({ action: "create", title: "Old", tasks: ["a"] }, oldId);
    session.newSession();
    const newId = session.getSessionId();
    expect(oldId).not.toBe(newId);
    expect(loadPlanSummary(newId)).toBe("");
    expect(loadPlanSummary(oldId)).toContain("Old");
    ws.cleanup();
  });
});
