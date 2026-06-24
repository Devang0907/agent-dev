import { describe, expect, it } from "vitest";
import { formatToolForDisplay } from "../../src/tui/format-tool.js";
import { wrapText } from "../../src/tui/utils/text.js";
import {
  chatViewportHeight,
  effectiveScrollTop,
  isFollowing,
  listWindowStart,
} from "../../src/tui/utils/scroll.js";

describe("formatToolForDisplay", () => {
  it("formats dev server bash output", () => {
    const out = formatToolForDisplay(
      "bash",
      "Dev server started in background (PID 123).\nOpen http://localhost:3000",
    );
    expect(out).toContain("Dev server");
    expect(out).toContain("localhost");
  });

  it("formats grep line", () => {
    expect(formatToolForDisplay("grep", "src/foo.ts:10:match")).toContain("grep");
  });
});

describe("scroll helpers", () => {
  it("wraps text to width", () => {
    const lines = wrapText("hello world foo", 6);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("computes viewport height", () => {
    expect(chatViewportHeight(40, 0, 6)).toBeGreaterThan(0);
  });

  it("follows when offset null at bottom", () => {
    expect(isFollowing(null, 10)).toBe(true);
    expect(effectiveScrollTop(null, 10)).toBe(10);
  });

  it("computes list window start for dialog scrolling", () => {
    expect(listWindowStart(0, 20, 12)).toBe(0);
    expect(listWindowStart(11, 20, 12)).toBe(0);
    expect(listWindowStart(12, 20, 12)).toBe(1);
    expect(listWindowStart(19, 20, 12)).toBe(8);
  });
});
