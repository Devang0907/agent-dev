import { describe, expect, it, vi, beforeEach } from "vitest";
import { VoiceError } from "../../src/voice/types.js";

const { recordUntilSilence, transcribeAudio } = vi.hoisted(() => ({
  recordUntilSilence: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("../../src/voice/recorder.js", () => ({
  recordUntilSilence,
}));

vi.mock("../../src/voice/transcribe.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/voice/transcribe.js")>();
  return {
    ...actual,
    transcribeAudio,
  };
});

import { listenForVoice } from "../../src/voice/listen.js";
import { assertVoiceAuth } from "../../src/voice/transcribe.js";

describe("listenForVoice", () => {
  beforeEach(() => {
    recordUntilSilence.mockReset();
    transcribeAudio.mockReset();
    delete process.env.GROQ_API_KEY;
  });

  it("requires Groq auth before recording", async () => {
    await expect(listenForVoice()).rejects.toMatchObject({ code: "NO_API_KEY" });
    expect(recordUntilSilence).not.toHaveBeenCalled();
  });

  it("records then transcribes with state callbacks", async () => {
    process.env.GROQ_API_KEY = "test-key";
    recordUntilSilence.mockResolvedValue(Buffer.from("wav"));
    transcribeAudio.mockResolvedValue("fix the login bug");

    const states: string[] = [];
    const text = await listenForVoice(undefined, {
      onStateChange: (state) => states.push(state),
    });

    expect(text).toBe("fix the login bug");
    expect(states).toEqual(["listening", "transcribing"]);
    expect(recordUntilSilence).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledWith(Buffer.from("wav"), undefined);
  });

  it("aborts after recording when signal is already aborted", async () => {
    process.env.GROQ_API_KEY = "test-key";
    recordUntilSilence.mockResolvedValue(Buffer.from("wav"));
    const controller = new AbortController();
    controller.abort();

    await expect(
      listenForVoice(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("aborts after recording completes if signal fires before transcribe", async () => {
    process.env.GROQ_API_KEY = "test-key";
    recordUntilSilence.mockImplementation(async (opts) => {
      opts?.signal?.addEventListener("abort", () => {}, { once: true });
      return Buffer.from("wav");
    });
    const controller = new AbortController();

    const promise = listenForVoice(undefined, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("aborts after transcription if signal fires during transcribe", async () => {
    process.env.GROQ_API_KEY = "test-key";
    recordUntilSilence.mockResolvedValue(Buffer.from("wav"));
    transcribeAudio.mockImplementation(async () => {
      controller.abort();
      return "hello";
    });
    const controller = new AbortController();

    await expect(
      listenForVoice(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("rejects empty transcripts", async () => {
    process.env.GROQ_API_KEY = "test-key";
    recordUntilSilence.mockResolvedValue(Buffer.from("wav"));
    transcribeAudio.mockResolvedValue("");

    await expect(listenForVoice()).rejects.toMatchObject({ code: "EMPTY_TRANSCRIPT" });
  });

  it("assertVoiceAuth is exported from transcribe module", () => {
    expect(() => assertVoiceAuth()).toThrow(VoiceError);
  });
});
