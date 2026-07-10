import type { Settings } from "../config/settings.js";
import { getVoiceSettings } from "../config/settings.js";
import { recordUntilSilence } from "./recorder.js";
import { assertVoiceAuth, transcribeAudio } from "./transcribe.js";
import { VoiceError } from "./types.js";

export interface ListenOptions {
  signal?: AbortSignal;
  onStateChange?: (state: "listening" | "transcribing") => void;
}

export async function listenForVoice(
  settings?: Settings,
  options: ListenOptions = {},
): Promise<string> {
  assertVoiceAuth(settings);
  const voice = getVoiceSettings(settings);

  options.onStateChange?.("listening");
  const wav = await recordUntilSilence({
    silenceMs: voice.silenceMs,
    maxDurationMs: voice.maxDurationMs,
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    throw new VoiceError("ABORTED", "Voice input cancelled");
  }

  options.onStateChange?.("transcribing");
  const text = await transcribeAudio(wav, settings);

  if (options.signal?.aborted) {
    throw new VoiceError("ABORTED", "Voice input cancelled");
  }

  if (!text.trim()) {
    throw new VoiceError("EMPTY_TRANSCRIPT", "Couldn't detect speech — try again");
  }

  return text;
}
