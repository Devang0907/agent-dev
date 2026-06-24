import { describe, expect, it } from "vitest";
import {
  buildDefaultSystemPrompt,
  buildSystemPrompt,
  systemPromptForModel,
} from "../../src/agent/system-prompt.js";
import { executePlan, loadPlanSummary } from "../../src/agent/tools/plan.js";
import { sampleSettings } from "../fixtures/sample-settings.js";

describe("system prompt", () => {
  it("includes execution rules in build mode", () => {
    const prompt = buildDefaultSystemPrompt("/tmp/project", "build");
    expect(prompt).toContain("NO sandbox");
    expect(prompt).toContain("npm run dev");
  });

  it("includes plan mode restrictions", () => {
    const prompt = buildDefaultSystemPrompt("/tmp/project", "plan");
    expect(prompt).toContain("Plan mode is ACTIVE");
    expect(prompt).toContain("Do NOT run shell commands");
  });

  it("includes active plan for matching session only", async () => {
    await executePlan(
      { action: "create", title: "Active", tasks: ["step"] },
      "prompt-session",
    );
    const withPlan = buildSystemPrompt("/tmp", sampleSettings(), undefined, "prompt-session");
    const withoutPlan = buildSystemPrompt("/tmp", sampleSettings(), undefined, "other-session");
    expect(withPlan).toContain("Active plan");
    expect(withoutPlan).not.toContain("Active plan");
    expect(loadPlanSummary("prompt-session")).toContain("Active");
  });

  it("adds GPT-OSS provider notes", () => {
    const prompt = systemPromptForModel({
      provider: "free",
      id: "openai/gpt-oss-20b:free",
      name: "GPT-OSS",
    });
    expect(prompt).toContain("sandbox");
    expect(prompt).toContain("bash");
  });

  it("adds Groq provider notes", () => {
    const prompt = systemPromptForModel({
      provider: "groq",
      id: "llama-3.3-70b",
      name: "Groq",
    });
    expect(prompt).toContain("function calls");
  });
});
