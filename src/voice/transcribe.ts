import OpenAI, { toFile } from "openai";
import type { Settings } from "../config/settings.js";
import { getVoiceSettings } from "../config/settings.js";
import { API_KEY_ENV, BASE_URL, getApiKey, hasAuth } from "../providers/groq.js";
import { formatApiError } from "../providers/openai-compat.js";
import { VoiceError } from "./types.js";

export const WHISPER_MODEL = "whisper-large-v3-turbo";

export function assertVoiceAuth(settings?: Settings): void {
  if (!hasAuth(settings)) {
    throw new VoiceError(
      "NO_API_KEY",
      `Missing ${API_KEY_ENV} for voice transcription. Set it in /settings or ${API_KEY_ENV} env.`,
    );
  }
}

export async function transcribeAudio(wav: Buffer, settings?: Settings): Promise<string> {
  assertVoiceAuth(settings);

  const apiKey = getApiKey(settings)!;
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const voice = getVoiceSettings(settings);

  try {
    const file = await toFile(wav, "voice.wav", { type: "audio/wav" });
    const result = await client.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      language: voice.language,
    });
    return result.text.trim();
  } catch (err) {
    throw new VoiceError("TRANSCRIBE_ERROR", formatApiError(err));
  }
}
