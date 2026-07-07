import { Microphone } from "decibri";
import { pcmToWav } from "./wav.js";
import { VoiceError } from "./types.js";
import { DEFAULT_VOICE_MAX_DURATION_MS, DEFAULT_VOICE_SILENCE_MS } from "./types.js";

const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export interface RecordOptions {
  silenceMs?: number;
  maxDurationMs?: number;
  signal?: AbortSignal;
}

function formatMicError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Microphone unavailable: ${message}. Check Windows mic permissions and that a device is connected.`;
}

export async function recordUntilSilence(options: RecordOptions = {}): Promise<Buffer> {
  const silenceMs = options.silenceMs ?? DEFAULT_VOICE_SILENCE_MS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_VOICE_MAX_DURATION_MS;

  return new Promise((resolve, reject) => {
    let mic: Microphone | null = null;
    let heardSpeech = false;
    let finished = false;
    const chunks: Buffer[] = [];
    let maxTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (err?: VoiceError) => {
      if (finished) return;
      finished = true;
      if (maxTimer) clearTimeout(maxTimer);
      options.signal?.removeEventListener("abort", onAbort);
      try {
        mic?.stop();
      } catch {
        /* ignore */
      }
      if (err) {
        reject(err);
        return;
      }
      const pcm = Buffer.concat(chunks);
      if (pcm.length === 0) {
        reject(new VoiceError("NO_AUDIO", "No audio captured"));
        return;
      }
      resolve(pcmToWav(pcm, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE));
    };

    const onAbort = () => {
      finish(new VoiceError("ABORTED", "Voice input cancelled"));
    };

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      mic = new Microphone({
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        vad: { model: "energy", threshold: 0.01, holdoffMs: silenceMs },
      });
    } catch (err) {
      reject(new VoiceError("MIC_UNAVAILABLE", formatMicError(err)));
      return;
    }

    mic.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    mic.on("speech", () => {
      heardSpeech = true;
    });
    mic.on("silence", () => {
      if (heardSpeech) finish();
    });
    mic.on("error", (err: Error) => {
      finish(new VoiceError("MIC_ERROR", err.message));
    });

    maxTimer = setTimeout(() => {
      if (heardSpeech) {
        finish();
        return;
      }
      finish(new VoiceError("NO_SPEECH", "Couldn't detect speech — try again"));
    }, maxDurationMs);
  });
}
