import { describe, expect, it } from "vitest";
import { SessionManager } from "../../src/session/manager.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("SessionManager", () => {
  it("persists messages to jsonl", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "hello" });
    mgr.appendMessage({ role: "assistant", content: "hi" });
    mgr.setTitle("Test chat");
    mgr.saveAsLast();

    const reloaded = new SessionManager(mgr.sessionId);
    expect(reloaded.getMessages()).toHaveLength(2);
    expect(reloaded.getDisplayTitle()).toBe("Test chat");
    ws.cleanup();
  });

  it("loadLast returns saved session", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "x" });
    mgr.saveAsLast();
    const last = SessionManager.loadLast();
    expect(last?.sessionId).toBe(mgr.sessionId);
    ws.cleanup();
  });

  it("lists sessions", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "msg" });
    const list = SessionManager.listSessions();
    expect(list.some((s) => s.sessionId === mgr.sessionId)).toBe(true);
    ws.cleanup();
  });

  it("tracks entries with stable ids", () => {
    const ws = createTmpWorkspace();
    const mgr = new SessionManager(undefined, ws.path);
    mgr.appendMessage({ role: "user", content: "a" });
    const entries = mgr.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBeTruthy();
    ws.cleanup();
  });
});
