import { describe, expect, it } from "vitest";
import { formatModeStatus, parseBossArg } from "../../../src/gateway/telegram/commands.js";
import { AgentSession } from "../../../src/agent/session.js";
import { SessionManager } from "../../../src/session/manager.js";
import { sampleSettings } from "../../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../../fixtures/tmp-workspace.js";

describe("telegram commands", () => {
  it("formats mode status", () => {
    const ws = createTmpWorkspace();
    const session = new AgentSession(sampleSettings(), new SessionManager(undefined, ws.path), ws.path);
    expect(formatModeStatus(session)).toContain("build");
    ws.cleanup();
  });

  it("parses boss arg", () => {
    expect(parseBossArg("on")).toBe("boss");
    expect(parseBossArg("off")).toBe("off");
    expect(parseBossArg(undefined)).toBe("toggle");
  });
});
