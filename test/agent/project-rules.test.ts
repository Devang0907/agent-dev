import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverProjectRules } from "../../src/agent/project-rules.js";
import { buildSystemPrompt } from "../../src/agent/system-prompt.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { createTmpWorkspace } from "../fixtures/tmp-workspace.js";

describe("discoverProjectRules", () => {
  let prevConfigDir: string | undefined;
  let isolatedConfigDir: string;

  beforeEach(() => {
    prevConfigDir = process.env.AGENT_DEV_DIR;
    isolatedConfigDir = mkdtempSync(join(tmpdir(), "agent-dev-cfg-"));
    process.env.AGENT_DEV_DIR = isolatedConfigDir;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.AGENT_DEV_DIR;
    else process.env.AGENT_DEV_DIR = prevConfigDir;
    try {
      rmSync(isolatedConfigDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
  it("loads AGENTS.md from project and rules fragments", () => {
    const ws = createTmpWorkspace({
      git: true,
      files: {
        "AGENTS.md": "root rules",
        ".agent-dev/AGENTS.md": "project scoped",
        ".agent-dev/rules/10-style.md": "style guide",
        ".agent-dev/rules/20-tests.md": "test rules",
      },
    });
    const result = discoverProjectRules(ws.path);
    expect(result.files).toHaveLength(4);
    expect(result.text).toContain("root rules");
    expect(result.text).toContain("project scoped");
    expect(result.text).toContain("style guide");
    expect(result.text).toContain("test rules");
    ws.cleanup();
  });

  it("walks git root to cwd in root-to-leaf order", () => {
    const ws = createTmpWorkspace({ git: true });
    const sub = join(ws.path, "packages", "app");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(ws.path, "AGENTS.md"), "repo root", "utf8");
    writeFileSync(join(ws.path, "packages", "AGENTS.md"), "packages", "utf8");
    writeFileSync(join(sub, "CLAUDE.md"), "app leaf", "utf8");

    const result = discoverProjectRules(sub);
    const contents = result.files.map((f) => f.content);
    expect(contents).toContain("repo root");
    expect(contents).toContain("packages");
    expect(contents).toContain("app leaf");
    const rootIdx = contents.indexOf("repo root");
    const pkgIdx = contents.indexOf("packages");
    const leafIdx = contents.indexOf("app leaf");
    expect(rootIdx).toBeLessThan(pkgIdx);
    expect(pkgIdx).toBeLessThan(leafIdx);
    ws.cleanup();
  });

  it("truncates when maxChars exceeded", () => {
    const ws = createTmpWorkspace({
      files: { "AGENTS.md": "x".repeat(100) },
    });
    const result = discoverProjectRules(ws.path, sampleSettings({ projectRules: { maxChars: 50 } }));
    expect(result.text.length).toBeLessThanOrEqual(120);
    expect(result.text).toContain("truncated");
    ws.cleanup();
  });

  it("returns empty when disabled via settings", () => {
    const ws = createTmpWorkspace({ files: { "AGENTS.md": "rules" } });
    const result = discoverProjectRules(ws.path, sampleSettings({ projectRules: { enabled: false } }));
    expect(result.files).toHaveLength(0);
    expect(result.text).toBe("");
    ws.cleanup();
  });

  it("injects into system prompt", () => {
    const ws = createTmpWorkspace({ files: { "AGENTS.md": "Always run tests" } });
    const prompt = buildSystemPrompt(ws.path, sampleSettings());
    expect(prompt).toContain("Project rules:");
    expect(prompt).toContain("Always run tests");
    ws.cleanup();
  });
});
