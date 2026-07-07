import type { ToolDefinition } from "../../providers/types.js";
import { getVoiceContext } from "./voice-context.js";

export const voiceTool: ToolDefinition = {
  name: "voice",
  description:
    "Listen to the user speak via microphone, transcribe speech to text (Groq Whisper), and return the transcript. Use when the user wants to speak instead of type, or when spoken input would be faster. Requires GROQ_API_KEY and the interactive terminal UI.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Optional message shown while listening (what you want the user to say)",
      },
    },
    additionalProperties: false,
  },
};

export async function executeVoice(args: { prompt?: string }): Promise<string> {
  const ctx = getVoiceContext();
  if (!ctx?.onVoiceRequest) {
    return "Error: voice input is only available in the interactive terminal UI.";
  }

  const text = await ctx.onVoiceRequest(args.prompt?.trim() || undefined);
  if (!text?.trim()) {
    return "Error: voice input cancelled or empty.";
  }
  return text.trim();
}
