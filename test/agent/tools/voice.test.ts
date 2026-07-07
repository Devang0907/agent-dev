import { describe, expect, it, vi, beforeEach } from "vitest";

const onVoiceRequest = vi.fn();

vi.mock("../../../src/agent/tools/voice-context.js", () => ({
  getVoiceContext: vi.fn(() => ({ onVoiceRequest })),
}));

import { executeVoice } from "../../../src/agent/tools/voice.js";
import { getVoiceContext } from "../../../src/agent/tools/voice-context.js";

describe("executeVoice", () => {
  beforeEach(() => {
    onVoiceRequest.mockReset();
    vi.mocked(getVoiceContext).mockReturnValue({ onVoiceRequest });
  });

  it("returns error when voice context is unavailable", async () => {
    vi.mocked(getVoiceContext).mockReturnValue(null);
    const result = await executeVoice({});
    expect(result).toMatch(/interactive terminal/i);
  });

  it("returns transcribed text from context", async () => {
    onVoiceRequest.mockResolvedValue("list files in src");
    const result = await executeVoice({ prompt: "Say your task" });
    expect(result).toBe("list files in src");
    expect(onVoiceRequest).toHaveBeenCalledWith("Say your task");
  });

  it("returns error for empty transcript", async () => {
    onVoiceRequest.mockResolvedValue("   ");
    const result = await executeVoice({});
    expect(result).toMatch(/empty/i);
  });
});
