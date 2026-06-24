import { describe, expect, it } from "vitest";
import {
  chunkMessage,
  escapeMarkdown,
  formatPermissionMessage,
  formatToolStatus,
  truncate,
} from "../../../src/gateway/telegram/format.js";

describe("telegram format", () => {
  it("escapes markdown specials", () => {
    expect(escapeMarkdown("hello.world")).toBe("hello\\.world");
  });

  it("truncates long text", () => {
    expect(truncate("abcdef", 5)).toBe("ab...");
  });

  it("chunks long messages", () => {
    const chunks = chunkMessage("a".repeat(9000), 4000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("").length).toBe(9000);
  });

  it("formats bash tool status", () => {
    const status = formatToolStatus({
      id: "1",
      name: "bash",
      arguments: JSON.stringify({ command: "npm test" }),
    });
    expect(status).toContain("npm test");
  });

  it("formats permission message", () => {
    expect(formatPermissionMessage("rm -rf /")).toContain("approval required");
  });
});
