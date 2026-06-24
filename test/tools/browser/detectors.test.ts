import { describe, expect, it } from "vitest";
import { isDestructiveBrowserAction } from "../../../src/agent/tools/browser/detectors.js";

describe("isDestructiveBrowserAction", () => {
  it("flags checkout URLs", () => {
    expect(
      isDestructiveBrowserAction({ action: "navigate", url: "https://shop.com/checkout" }),
    ).toBe(true);
  });

  it("flags explicit approval", () => {
    expect(
      isDestructiveBrowserAction({ action: "click", selector: "button", requiresApproval: true }),
    ).toBe(true);
  });

  it("allows benign navigation", () => {
    expect(
      isDestructiveBrowserAction({ action: "navigate", url: "https://example.com/docs" }),
    ).toBe(false);
  });
});
