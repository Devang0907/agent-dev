import { describe, expect, it } from "vitest";
import { buildDefaultSystemPrompt } from "../../src/agent/system-prompt.js";

describe("dev server execution regression", () => {
  it("system prompt tells agent to use bash for dev servers", () => {
    const prompt = buildDefaultSystemPrompt(process.cwd(), "build");
    expect(prompt).toMatch(/npm run dev/i);
    expect(prompt).toMatch(/Never refuse to run dev servers/i);
    expect(prompt).toMatch(/NO sandbox/i);
  });

  it("platform context says real local machine", () => {
    const prompt = buildDefaultSystemPrompt(process.cwd(), "build");
    expect(prompt).toMatch(/real local machine/i);
  });
});
