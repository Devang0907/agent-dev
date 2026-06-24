import { describe, expect, it } from "vitest";
import { findCutPoint } from "../../../src/agent/compaction/cut-point.js";
import type { SessionEntry } from "../../../src/session/manager.js";

function msgEntry(id: string, role: "user" | "assistant" | "tool", content: string, extra?: object): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: new Date().toISOString(),
    data: { role, content, ...extra },
  };
}

describe("findCutPoint", () => {
  it("returns null when nothing to summarize", () => {
    const entries: SessionEntry[] = [msgEntry("u1", "user", "hi")];
    expect(findCutPoint(entries, 20_000)).toBeNull();
  });

  it("never cuts at tool messages", () => {
    const entries: SessionEntry[] = [
      msgEntry("u1", "user", "a".repeat(80_000)),
      msgEntry("a1", "assistant", "ok", {
        toolCalls: [{ id: "t1", name: "read", arguments: '{"path":"x"}' }],
      }),
      msgEntry("t1", "tool", "file contents".repeat(5000), { toolCallId: "t1", name: "read" }),
      msgEntry("u2", "user", "recent"),
    ];
    const cut = findCutPoint(entries, 100);
    expect(cut).not.toBeNull();
    expect(cut!.firstKeptEntryId).not.toBe("t1");
    const keptRoles = entries
      .slice(entries.findIndex((e) => e.id === cut!.firstKeptEntryId))
      .filter((e) => e.type === "message")
      .map((e) => (e.data as { role: string }).role);
    expect(keptRoles[0]).not.toBe("tool");
  });

  it("keeps recent messages by token budget", () => {
    const entries: SessionEntry[] = [
      msgEntry("u1", "user", "old ".repeat(10_000)),
      msgEntry("a1", "assistant", "old reply"),
      msgEntry("u2", "user", "new ".repeat(200)),
      msgEntry("a2", "assistant", "new reply"),
    ];
    const cut = findCutPoint(entries, 50);
    expect(cut).not.toBeNull();
    expect(cut!.messagesToSummarize.length).toBeGreaterThan(0);
    expect(cut!.firstKeptEntryId).toBe("u2");
  });
});
