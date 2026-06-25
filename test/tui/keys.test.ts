import { describe, expect, it } from "vitest";
import { isSubmitKey } from "../../src/tui/utils/keys.js";
import type { KeyEvent } from "@opentui/core";

function key(name: string, shift = false): KeyEvent {
  return { name, shift } as KeyEvent;
}

describe("isSubmitKey", () => {
  it("matches common Enter key names on Windows terminals", () => {
    expect(isSubmitKey(key("return"))).toBe(true);
    expect(isSubmitKey(key("enter"))).toBe(true);
    expect(isSubmitKey(key("kpenter"))).toBe(true);
    expect(isSubmitKey(key("linefeed"))).toBe(true);
  });

  it("ignores Shift+Enter so newline bindings can handle it", () => {
    expect(isSubmitKey(key("return", true))).toBe(false);
    expect(isSubmitKey(key("enter", true))).toBe(false);
  });
});
