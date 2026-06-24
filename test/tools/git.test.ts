import { describe, expect, it } from "vitest";
import { isGitWriteAction } from "../../src/agent/tools/git.js";

describe("isGitWriteAction", () => {
  it.each([
    ["status", false],
    ["diff", false],
    ["log", false],
    ["commit", true],
    ["push", true],
    ["add", true],
    ["reset --hard", true],
  ])("git %s write=%s", (action, write) => {
    expect(isGitWriteAction(action)).toBe(write);
  });
});
