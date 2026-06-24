import { describe, expect, it } from "vitest";
import { executeListDir } from "../../src/agent/tools/list-dir.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

describe("list_dir tool", () => {
  it("lists flat directory contents", async () => {
    const ws = createTmpWorkspace({
      files: { "a.txt": "a", "b.txt": "b" },
    });
    mkdirSync(join(ws.path, "subdir"));

    const result = await executeListDir({ path: "." }, ws.path);
    expect(result).toContain("subdir/");
    expect(result).toContain("a.txt");
    expect(result).toContain("b.txt");
    ws.cleanup();
  });

  it("lists recursively when requested", async () => {
    const ws = createTmpWorkspace();
    mkdirSync(join(ws.path, "src", "nested"), { recursive: true });
    const result = await executeListDir({ path: ".", recursive: true }, ws.path);
    expect(result).toContain("src/");
    expect(result).toContain("src/nested/");
    ws.cleanup();
  });

  it("rejects paths outside workdir", async () => {
    const ws = createTmpWorkspace();
    await expect(executeListDir({ path: "../outside" }, ws.path)).rejects.toThrow(
      /outside working directory/,
    );
    ws.cleanup();
  });
});
