import { describe, expect, it } from "vitest";
import { MAX_DELEGATIONS_PER_TURN } from "../../src/agent/orchestrator/context.js";

describe("delegation limits", () => {
  it("exports sane max delegations", () => {
    expect(MAX_DELEGATIONS_PER_TURN).toBeGreaterThan(0);
    expect(MAX_DELEGATIONS_PER_TURN).toBeLessThanOrEqual(20);
  });
});
