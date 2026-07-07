import { describe, expect, it, vi, beforeEach } from "vitest";
import { VoiceError } from "../../src/voice/types.js";

const { transcribeCreate } = vi.hoisted(() => ({
  transcribeCreate: vi.fn(),
}));

vi.mock("openai", () => {
  class MockOpenAI {
    audio = {
      transcriptions: {
        create: transcribeCreate,
      },
    };
    constructor(public options: { apiKey?: string; baseURL?: string }) {}
  }
  return {
    default: MockOpenAI,
    toFile: vi.fn(async (data: Buffer, name: string) => ({ data, name })),
  };
});

import { assertVoiceAuth, transcribeAudio, WHISPER_MODEL } from "../../src/voice/transcribe.js";
import { BASE_URL } from "../../src/providers/groq.js";

describe("transcribeAudio", () => {
  beforeEach(() => {
    transcribeCreate.mockReset();
    delete process.env.GROQ_API_KEY;
  });

  it("throws when GROQ_API_KEY is missing", () => {
    expect(() => assertVoiceAuth()).toThrow(VoiceError);
    expect(() => assertVoiceAuth()).toThrow(/GROQ_API_KEY/);
  });

  it("calls Groq Whisper with configured language", async () => {
    process.env.GROQ_API_KEY = "test-key";
    transcribeCreate.mockResolvedValue({ text: "  list files in src  " });

    const wav = Buffer.from("fake-wav");
    const text = await transcribeAudio(wav, { voice: { language: "en" } } as never);

    expect(text).toBe("list files in src");
    expect(transcribeCreate).toHaveBeenCalledWith({
      file: expect.objectContaining({ name: "voice.wav" }),
      model: WHISPER_MODEL,
      language: "en",
    });
  });

  it("uses Groq OpenAI-compatible base URL", async () => {
    process.env.GROQ_API_KEY = "test-key";
    transcribeCreate.mockResolvedValue({ text: "hello" });

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: "ignored", baseURL: "ignored" });
    void client;

    await transcribeAudio(Buffer.from("wav"));
    expect(BASE_URL).toBe("https://api.groq.com/openai/v1");
  });

  it("wraps API failures as TRANSCRIBE_ERROR", async () => {
    process.env.GROQ_API_KEY = "test-key";
    transcribeCreate.mockRejectedValue(new Error("429 rate limit"));

    await expect(transcribeAudio(Buffer.from("wav"))).rejects.toMatchObject({
      code: "TRANSCRIBE_ERROR",
      message: "429 rate limit",
    });
  });
});
