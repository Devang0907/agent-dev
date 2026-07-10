import { describe, expect, it } from "vitest";
import { mergeVoiceTranscript } from "../../src/ui/Editor.js";

describe("mergeVoiceTranscript", () => {
  it("uses transcript as-is when input is empty", () => {
    expect(mergeVoiceTranscript("", 0, "hello world")).toEqual({
      text: "hello world",
      cursorPos: 11,
    });
  });

  it("appends at cursor with spacing", () => {
    expect(mergeVoiceTranscript("fix the", 7, "login bug")).toEqual({
      text: "fix the login bug",
      cursorPos: 17,
    });
  });

  it("inserts at middle of text", () => {
    expect(mergeVoiceTranscript("fix bug", 4, "the")).toEqual({
      text: "fix the bug",
      cursorPos: 7,
    });
  });
});
