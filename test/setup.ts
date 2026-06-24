import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

const API_KEYS = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
] as const;

let rootTestDir = mkdtempSync(join(tmpdir(), "agent-dev-test-"));

beforeEach(() => {
  const perTest = mkdtempSync(join(rootTestDir, "case-"));
  process.env.AGENT_DEV_DIR = perTest;
  for (const key of API_KEYS) {
    delete process.env[key];
  }
});

afterAll(() => {
  try {
    rmSync(rootTestDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors on Windows
  }
});
