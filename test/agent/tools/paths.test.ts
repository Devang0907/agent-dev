import { describe, expect, it } from "vitest";
import { resolvePath, assertWithinWorkdir } from "../../../src/agent/tools/paths.js";
import { createTmpWorkspace } from "../../fixtures/tmp-workspace.js";
import { join } from "node:path";

describe("resolvePath", () => {
  const ws = createTmpWorkspace();
  it("resolves relative paths", () => {
    expect(resolvePath("src/foo.ts", ws.path)).toBe(join(ws.path, "src/foo.ts"));
  });
  it("keeps absolute paths", () => {
    expect(resolvePath("/tmp/x", ws.path)).toBe("/tmp/x");
  });
  ws.cleanup();
});

describe("assertWithinWorkdir", () => {
  const ws = createTmpWorkspace();
  it("allows paths inside workdir", () => {
    expect(() => assertWithinWorkdir(join(ws.path, "a.ts"), ws.path)).not.toThrow();
  });
  it("blocks traversal", () => {
    expect(() => assertWithinWorkdir(join(ws.path, "..", "outside.ts"), ws.path)).toThrow(
      /outside working directory/,
    );
  });
  ws.cleanup();
});
