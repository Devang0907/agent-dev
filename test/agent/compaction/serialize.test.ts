import { describe, expect, it } from "vitest";
import { serializeConversation, truncateToolContent } from "../../../src/agent/compaction/serialize.js";

describe("truncateToolContent", () => {
  it("truncates long tool output", () => {
    const out = truncateToolContent("x".repeat(3000), 2000);
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain("truncated");
  });
});

describe("serializeConversation", () => {
  it("labels roles for summarization", () => {
    const text = serializeConversation([
      { role: "user", content: "fix the bug" },
      { role: "assistant", content: "I'll read the file" },
      { role: "tool", content: "src/foo.ts", toolCallId: "1", name: "read" },
    ]);
    expect(text).toContain("[User]:");
    expect(text).toContain("[Assistant]:");
    expect(text).toContain("[Tool result (read)]:");
  });
});
