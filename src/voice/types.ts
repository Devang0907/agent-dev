export type VoiceState = "idle" | "listening" | "transcribing" | "error";

export type VoiceErrorCode =
  | "ABORTED"
  | "NO_API_KEY"
  | "NO_AUDIO"
  | "NO_SPEECH"
  | "EMPTY_TRANSCRIPT"
  | "MIC_UNAVAILABLE"
  | "MIC_ERROR"
  | "TRANSCRIBE_ERROR";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message: string) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
  }
}

export const DEFAULT_VOICE_SILENCE_MS = 1500;
export const DEFAULT_VOICE_MAX_DURATION_MS = 60_000;
export const DEFAULT_VOICE_LANGUAGE = "en";
