import { describe, expect, it } from "vitest";
import { executeDiff } from "../../src/agent/tools/diff.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("diff tool", () => {
  it("generates diff for new content", async () => {
    const ws = createTmpWorkspace({ files: { "a.ts": "line1\nline2\n" } });
    const result = await executeDiff({ path: "a.ts", new_content: "line1\nline3\n" }, ws.path);
    expect(result).toContain("---");
    expect(result).toContain("+++");
    ws.cleanup();
  });

  it("reports no changes", async () => {
    const ws = createTmpWorkspace({ files: { "a.ts": "same" } });
    const result = await executeDiff({ path: "a.ts", new_content: "same" }, ws.path);
    expect(result).toMatch(/No changes/i);
    ws.cleanup();
  });
});
