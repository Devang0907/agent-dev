import type { Settings } from "../../config/settings.js";

export interface VoiceContext {
  settings?: Settings;
  onVoiceRequest?: (prompt?: string) => Promise<string | null>;
}

let voiceContext: VoiceContext | null = null;

export function setVoiceContext(ctx: VoiceContext | null): void {
  voiceContext = ctx;
}

export function getVoiceContext(): VoiceContext | null {
  return voiceContext;
}
