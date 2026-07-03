import { describe, expect, it } from "vitest";
import {
  FileClaimRegistry,
  normalizeClaimPath,
  checkFileScopeBlock,
} from "../../../src/agent/multi-agent/file-claims.js";
import { auditFilePath } from "../../../src/agent/multi-agent/agents.js";
import { resolve } from "node:path";

const WORKDIR = resolve(process.cwd(), "fake-project");

describe("normalizeClaimPath", () => {
  it("normalizes relative paths to lowercase forward slashes", () => {
    expect(normalizeClaimPath("src\\Foo.TS", WORKDIR)).toBe("src/foo.ts");
    expect(normalizeClaimPath("./src/foo.ts", WORKDIR)).toBe("src/foo.ts");
  });

  it("resolves absolute paths inside the workdir", () => {
    expect(normalizeClaimPath(resolve(WORKDIR, "src", "a.ts"), WORKDIR)).toBe("src/a.ts");
  });

  it("rejects paths outside the workdir", () => {
    expect(normalizeClaimPath("../outside.ts", WORKDIR)).toBeNull();
  });
});

describe("FileClaimRegistry", () => {
  it("allows disjoint claims from different runs", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    expect(reg.claim("run1", ["src/a.ts"]).ok).toBe(true);
    expect(reg.claim("run2", ["src/b.ts"]).ok).toBe(true);
  });

  it("rejects overlapping claims between runs", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    expect(reg.claim("run1", ["src/a.ts"]).ok).toBe(true);
    const result = reg.claim("run2", ["SRC\\A.TS"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflict.ownerRunId).toBe("run1");
    }
  });

  it("releases claims when a run ends", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    reg.claim("run1", ["src/a.ts"]);
    reg.release("run1");
    expect(reg.claim("run2", ["src/a.ts"]).ok).toBe(true);
  });

  it("blocks writes to files claimed by another run", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    reg.claim("run1", ["src/a.ts"]);
    reg.claim("run2", ["src/b.ts"]);
    expect(reg.checkWrite("run2", "src/a.ts", true)).toMatch(/claimed by concurrent/);
    expect(reg.checkWrite("run2", "src/b.ts", true)).toBeNull();
  });

  it("blocks writes outside a declared scope", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    reg.claim("run1", ["src/a.ts"]);
    expect(reg.checkWrite("run1", "src/other.ts", true)).toMatch(/not in your declared/);
  });

  it("always allows audit and plan paths", () => {
    const reg = new FileClaimRegistry(WORKDIR);
    reg.claim("run1", ["src/a.ts"]);
    expect(reg.checkWrite("run1", auditFilePath("sess", "run1"), true)).toBeNull();
    expect(reg.checkWrite("run1", ".agent-dev/plans/x.md", true)).toBeNull();
  });
});

describe("checkFileScopeBlock", () => {
  const scope = ["src/a.ts", "src/b.ts"];

  it("does nothing when no scope or guard is set", () => {
    expect(checkFileScopeBlock("write", { path: "any.ts" }, WORKDIR)).toBeNull();
  });

  it("only guards write/edit/diff", () => {
    expect(checkFileScopeBlock("read", { path: "src/x.ts" }, WORKDIR, scope)).toBeNull();
    expect(checkFileScopeBlock("bash", { command: "rm -rf" }, WORKDIR, scope)).toBeNull();
  });

  it.each(["write", "edit", "diff"])("blocks %s outside the scope", (tool) => {
    expect(checkFileScopeBlock(tool, { path: "src/x.ts" }, WORKDIR, scope)).toMatch(
      /not in your declared files_touched scope/,
    );
  });

  it("allows writes inside the scope", () => {
    expect(checkFileScopeBlock("write", { path: "src/a.ts" }, WORKDIR, scope)).toBeNull();
    expect(checkFileScopeBlock("edit", { path: "SRC\\B.TS" }, WORKDIR, scope)).toBeNull();
  });

  it("always allows audit paths regardless of scope", () => {
    expect(
      checkFileScopeBlock("write", { path: auditFilePath("s", "r") }, WORKDIR, scope),
    ).toBeNull();
  });

  it("blocks paths outside the project", () => {
    expect(checkFileScopeBlock("write", { path: "../evil.ts" }, WORKDIR, scope)).toMatch(
      /outside the project/,
    );
  });

  it("consults the extra write guard", () => {
    const guard = (path: string) => (path.includes("a.ts") ? "Blocked by guard" : null);
    expect(checkFileScopeBlock("write", { path: "src/a.ts" }, WORKDIR, scope, guard)).toBe(
      "Blocked by guard",
    );
    expect(checkFileScopeBlock("write", { path: "src/b.ts" }, WORKDIR, scope, guard)).toBeNull();
  });
});
