import { describe, expect, it } from "vitest";
import { buildWavHeader, pcmToWav } from "../../src/voice/wav.js";

describe("wav", () => {
  it("builds a 44-byte RIFF header", () => {
    const header = buildWavHeader(1000, 16000, 1, 16);
    expect(header.length).toBe(44);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
    expect(header.readUInt32LE(40)).toBe(1000);
  });

  it("wraps PCM in a valid WAV buffer", () => {
    const pcm = Buffer.alloc(320, 0);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(44).equals(pcm)).toBe(true);
  });
});
