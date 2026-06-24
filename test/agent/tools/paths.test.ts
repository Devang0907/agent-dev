import { describe, expect, it } from "vitest";
import { resolvePath, assertWithinWorkdir } from "../../../src/agent/tools/paths.js";
import { createTmpWorkspace } from "../../fixtures/tmp-workspace.js";
import { join } from "node:path";
import { mkdirSync, symlinkSync, writeFileSync, existsSync } from "node:fs";

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
  it("allows write to not-yet-created file under workdir", () => {
    expect(() =>
      assertWithinWorkdir(join(ws.path, "new-dir", "new-file.ts"), ws.path),
    ).not.toThrow();
  });
  ws.cleanup();

  it("blocks symlink escape when symlink is supported", () => {
    const ws = createTmpWorkspace();
    const outsideDir = join(ws.path, "..", `agent-dev-outside-${Date.now()}`);
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, "secret.txt"), "secret");

    const linkPath = join(ws.path, "escape-link");
    try {
      symlinkSync(join(outsideDir, "secret.txt"), linkPath);
    } catch {
      ws.cleanup();
      return;
    }

    expect(() => assertWithinWorkdir(linkPath, ws.path)).toThrow(/outside working directory/);
    ws.cleanup();
  });

  if (process.platform === "win32") {
    it("is case-insensitive on Windows", () => {
      const ws = createTmpWorkspace({ files: { "Test.txt": "x" } });
      const upperRoot = ws.path.toUpperCase();
      expect(() => assertWithinWorkdir(join(upperRoot, "Test.txt"), ws.path)).not.toThrow();
      ws.cleanup();
    });
  }
});
