import { describe, expect, it } from "vitest";
import { fallbackTitle } from "../../src/session/title.js";

describe("fallbackTitle", () => {
  it("returns New chat for empty", () => {
    expect(fallbackTitle("   ")).toBe("New chat");
  });

  it("truncates long titles", () => {
    const long = "a".repeat(60);
    expect(fallbackTitle(long).length).toBeLessThanOrEqual(48);
    expect(fallbackTitle(long)).toContain("…");
  });

  it("keeps short titles", () => {
    expect(fallbackTitle("Fix login bug")).toBe("Fix login bug");
  });
});
