import { describe, expect, it } from "vitest";
import {
  BOSS_TOOL_NAMES,
  getWorkerProfile,
  listWorkerIds,
  WORKER_PROFILES,
} from "../../../src/agent/orchestrator/workers.js";

describe("worker catalog", () => {
  it("lists known workers", () => {
    expect(listWorkerIds()).toEqual(expect.arrayContaining(["explore", "implement", "shell", "plan"]));
  });

  it("returns profile for each worker", () => {
    for (const id of listWorkerIds()) {
      expect(getWorkerProfile(id)?.id).toBe(id);
    }
  });

  it("boss tools are plan and delegate", () => {
    expect([...BOSS_TOOL_NAMES]).toEqual(["plan", "delegate"]);
  });

  it("each worker has tools", () => {
    for (const id of listWorkerIds()) {
      expect(WORKER_PROFILES[id].tools.length).toBeGreaterThan(0);
    }
  });
});
