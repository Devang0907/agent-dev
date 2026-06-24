import { describe, expect, it } from "vitest";
import {
  extractFailedGeneration,
  mergeToolNameChunk,
  normalizeToolCalls,
  parseMalformedToolCalls,
  recoverToolCallsFromValidationError,
  sanitizeErrorForUser,
  sanitizeToolName,
  stripMalformedToolText,
} from "../../src/providers/openai-compat.js";
import {
  DUPLICATED_TOOL_NAME,
  FAILED_GENERATION,
  GPT_OSS_CHANNEL_LEAK,
  GROQ_FUNCTION_TAG,
  GROQ_PLAN_TAG,
  VALIDATION_ERROR,
} from "../fixtures/malformed-tool-outputs.js";

describe("sanitizeToolName", () => {
  it.each([
    [GPT_OSS_CHANNEL_LEAK, "browser"],
    ["functions.grep", "grep"],
    [DUPLICATED_TOOL_NAME, "grep"],
    ["  read  ", "read"],
  ])("sanitizes %s → %s", (input, expected) => {
    expect(sanitizeToolName(input)).toBe(expected);
  });
});

describe("mergeToolNameChunk", () => {
  it("appends partial chunks", () => {
    expect(mergeToolNameChunk("bro", "wser")).toBe("browser");
  });

  it("dedupes full repeated chunk", () => {
    expect(mergeToolNameChunk("browser", "browser")).toBe("browser");
  });

  it("prefers longer prefix match", () => {
    expect(mergeToolNameChunk("browser", "browserbrowser")).toBe("browserbrowser");
  });
});

describe("normalizeToolCalls", () => {
  it("fills empty id and arguments", () => {
    const [tc] = normalizeToolCalls([{ id: "", name: "read", arguments: "" }]);
    expect(tc.name).toBe("read");
    expect(tc.arguments).toBe("{}");
    expect(tc.id).toMatch(/^call_/);
  });
});

describe("parseMalformedToolCalls", () => {
  it("parses Groq function tag", () => {
    const calls = parseMalformedToolCalls(GROQ_FUNCTION_TAG);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("bash");
    expect(JSON.parse(calls[0]!.arguments)).toEqual({ command: "echo hello" });
  });

  it("parses plan create", () => {
    const calls = parseMalformedToolCalls(GROQ_PLAN_TAG);
    expect(calls[0]!.name).toBe("plan");
    const args = JSON.parse(calls[0]!.arguments);
    expect(args.action).toBe("create");
    expect(args.tasks).toEqual(["step one"]);
  });
});

describe("recoverToolCallsFromValidationError", () => {
  it("recovers from failed generation", () => {
    const calls = recoverToolCallsFromValidationError(FAILED_GENERATION);
    expect(calls.some((c) => c.name === "read")).toBe(true);
  });

  it("falls back to tool name from validation error", () => {
    const calls = recoverToolCallsFromValidationError(VALIDATION_ERROR);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.name).toBe("browser");
  });
});

describe("stripMalformedToolText", () => {
  it("removes function tags", () => {
    expect(stripMalformedToolText(`Hello ${GROQ_FUNCTION_TAG} world`)).toBe("Hello  world");
  });
});

describe("extractFailedGeneration", () => {
  it("extracts model output marker", () => {
    expect(extractFailedGeneration("Error Model output: foo")).toBe("foo");
  });
});

describe("sanitizeErrorForUser", () => {
  it("hides tool validation errors", () => {
    expect(sanitizeErrorForUser("Tool call validation failed")).toBeNull();
  });

  it("returns normal API errors", () => {
    expect(sanitizeErrorForUser("Rate limit exceeded")).toBe("Rate limit exceeded");
  });
});
