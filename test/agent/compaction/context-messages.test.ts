import { describe, expect, it } from "vitest";
import { SessionManager, COMPACTION_SUMMARY_PREFIX } from "../../../src/session/manager.js";
import { createTmpWorkspace } from "../../fixtures/tmp-workspace.js";

describe("SessionManager.getContextMessages", () => {
  it("returns all messages without compaction", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "hello" });
    mgr.appendMessage({ role: "assistant", content: "hi" });
    expect(mgr.getContextMessages()).toHaveLength(2);
    ws.cleanup();
  });

  it("injects summary and keeps tail after compaction entry", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "old task" });
    mgr.appendMessage({ role: "assistant", content: "old work" });
    const entries = mgr.getEntries();
    const secondId = entries[1]!.id;
    mgr.appendMessage({ role: "user", content: "recent" });
    mgr.appendCompaction({
      summary: "## Goal\n- build feature",
      firstKeptEntryId: secondId,
      tokensBefore: 50_000,
      reason: "manual",
    });

    const ctx = mgr.getContextMessages();
    expect(ctx[0]?.role).toBe("user");
    expect(ctx[0]?.content).toContain(COMPACTION_SUMMARY_PREFIX);
    expect(ctx[0]?.content).toContain("## Goal");
    expect(ctx.some((m) => m.content === "recent")).toBe(true);
    expect(mgr.getMessages()).toHaveLength(3);
    ws.cleanup();
  });

  it("persists compaction entry in jsonl", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "x" });
    const firstId = mgr.getEntries()[0]!.id;
    mgr.appendCompaction({
      summary: "summary",
      firstKeptEntryId: firstId,
      tokensBefore: 1000,
      reason: "threshold",
    });

    const reloaded = new SessionManager(mgr.sessionId);
    expect(reloaded.getLatestCompaction()?.data).toMatchObject({ reason: "threshold" });
    ws.cleanup();
  });
});
