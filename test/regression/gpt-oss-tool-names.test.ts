import { describe, expect, it } from "vitest";
import { sanitizeToolName } from "../../src/providers/openai-compat.js";
import { GPT_OSS_CHANNEL_LEAK, DUPLICATED_TOOL_NAME } from "../fixtures/malformed-tool-outputs.js";

describe("gpt-oss tool name regression", () => {
  it("strips harmony channel leak", () => {
    expect(sanitizeToolName(GPT_OSS_CHANNEL_LEAK)).toBe("browser");
  });

  it("dedupes doubled tool names", () => {
    expect(sanitizeToolName(DUPLICATED_TOOL_NAME)).toBe("grep");
  });
});
