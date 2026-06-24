import { describe, expect, it } from "vitest";
import { parseSkillFile } from "../../src/agent/skills.js";

describe("parseSkillFile", () => {
  it("parses YAML frontmatter", () => {
    const raw = `---
name: my-skill
description: Does things
---
Body content here`;
    const parsed = parseSkillFile(raw, "fallback");
    expect(parsed.name).toBe("my-skill");
    expect(parsed.description).toBe("Does things");
    expect(parsed.content).toContain("Body content");
  });

  it("uses fallback name without frontmatter", () => {
    const parsed = parseSkillFile("plain content", "fallback-name");
    expect(parsed.name).toBe("fallback-name");
  });
});
