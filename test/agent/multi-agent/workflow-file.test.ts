import { afterEach, describe, expect, it } from "vitest";
import {
  parseWorkflowAgents,
  loadWorkflowFile,
  loadWorkflowAgents,
} from "../../../src/agent/multi-agent/workflow-file.js";
import { createTmpWorkspace, type TmpWorkspace } from "../../fixtures/tmp-workspace.js";

const TWITTER_WORKFLOW = `---
name: scout
description: Read-only exploration. Answers "where is X" questions.
effort: low
tools: Read, Grep, Glob
---
Answer the specific question with a SHORT structured summary. Never paste whole
files. Never modify anything.

---
name: implementer
description: Implements an approved written plan.
effort: medium
---
You receive a scoped, approved plan from the orchestrator. Execute it exactly.

---
name: reviewer
description: Independently reviews plans and finished implementation work.
effort: high
tools: Read, Grep, Glob, Bash
---
You are an independent reviewer with fresh context.
Report exactly three sections: Blocking issues, Non-blocking issues, Verdict.
`;

let workspace: TmpWorkspace | null = null;

afterEach(() => {
  workspace?.cleanup();
  workspace = null;
});

describe("parseWorkflowAgents", () => {
  it("parses all frontmatter blocks from the Twitter format", () => {
    const profiles = parseWorkflowAgents(TWITTER_WORKFLOW);
    expect(profiles.map((p) => p.id)).toEqual(["scout", "implementer", "reviewer"]);
  });

  it("maps tool names to builtin tool ids", () => {
    const profiles = parseWorkflowAgents(TWITTER_WORKFLOW);
    const scout = profiles.find((p) => p.id === "scout")!;
    expect(scout.tools).toEqual(["read", "grep", "list_dir"]);
    expect(scout.canWrite).toBe(false);

    const reviewer = profiles.find((p) => p.id === "reviewer")!;
    expect(reviewer.tools).toContain("bash");
  });

  it("defaults tools (including write) when the block omits them", () => {
    const profiles = parseWorkflowAgents(TWITTER_WORKFLOW);
    const implementer = profiles.find((p) => p.id === "implementer")!;
    expect(implementer.tools).toContain("write");
    expect(implementer.canWrite).toBe(true);
  });

  it("parses effort levels and defaults to medium", () => {
    const profiles = parseWorkflowAgents(TWITTER_WORKFLOW);
    expect(profiles.find((p) => p.id === "scout")!.effort).toBe("low");
    expect(profiles.find((p) => p.id === "reviewer")!.effort).toBe("high");
    expect(parseWorkflowAgents("---\nname: x\neffort: bogus\n---\nbody")[0]!.effort).toBe(
      "medium",
    );
  });

  it("uses the block body as the system prompt", () => {
    const profiles = parseWorkflowAgents(TWITTER_WORKFLOW);
    expect(profiles.find((p) => p.id === "reviewer")!.systemPrompt).toContain(
      "independent reviewer",
    );
  });

  it("skips blocks without a name", () => {
    expect(parseWorkflowAgents("---\ndescription: nameless\n---\nbody")).toEqual([]);
  });

  it("returns empty for plain prose", () => {
    expect(parseWorkflowAgents("just some notes\nno blocks here")).toEqual([]);
  });
});

describe("loadWorkflowFile / loadWorkflowAgents", () => {
  it("returns null when the file is missing", () => {
    workspace = createTmpWorkspace();
    expect(loadWorkflowFile(workspace.path)).toBeNull();
    expect(loadWorkflowAgents(workspace.path)).toBeNull();
  });

  it("returns null when the file is empty or whitespace", () => {
    workspace = createTmpWorkspace({ files: { "multi_agents.md": "   \n\n  " } });
    expect(loadWorkflowFile(workspace.path)).toBeNull();
  });

  it("loads and parses a valid workflow file", () => {
    workspace = createTmpWorkspace({ files: { "multi_agents.md": TWITTER_WORKFLOW } });
    const profiles = loadWorkflowAgents(workspace.path);
    expect(profiles).not.toBeNull();
    expect(profiles!.map((p) => p.id)).toContain("scout");
  });

  it("returns null profiles for a non-empty file without agent blocks", () => {
    workspace = createTmpWorkspace({ files: { "multi_agents.md": "# notes\nplain text" } });
    expect(loadWorkflowFile(workspace.path)).not.toBeNull();
    expect(loadWorkflowAgents(workspace.path)).toBeNull();
  });
});
