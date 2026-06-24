import { describe, expect, it } from "vitest";
import { executeRead, executeWrite, executeEdit } from "../../src/agent/tools/read.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("read/write/edit tools", () => {
  it("reads and writes files", async () => {
    const ws = createTmpWorkspace();
    const writeResult = await executeWrite(
      { path: "hello.txt", content: "hello world" },
      ws.path,
    );
    expect(writeResult).toContain("hello.txt");

    const content = await executeRead({ path: "hello.txt" }, ws.path);
    expect(content).toBe("hello world");
    ws.cleanup();
  });

  it("returns error for missing file", async () => {
    const ws = createTmpWorkspace();
    const result = await executeRead({ path: "missing.txt" }, ws.path);
    expect(result).toMatch(/not found/);
    ws.cleanup();
  });

  it("edits file content", async () => {
    const ws = createTmpWorkspace({ files: { "a.txt": "foo bar" } });
    const result = await executeEdit(
      { path: "a.txt", old_string: "foo", new_string: "baz" },
      ws.path,
    );
    expect(result).toContain("Edited");
    const content = await executeRead({ path: "a.txt" }, ws.path);
    expect(content).toBe("baz bar");
    ws.cleanup();
  });

  it("truncates large reads", async () => {
    const ws = createTmpWorkspace({ files: { "big.txt": "x".repeat(60_000) } });
    const content = await executeRead({ path: "big.txt" }, ws.path);
    expect(content).toContain("truncated");
    ws.cleanup();
  });
});
