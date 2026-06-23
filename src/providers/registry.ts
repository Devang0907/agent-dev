import type { ChatContext, Model, ProviderId, StreamEvent } from "./types.js";
import type { Settings } from "../config/settings.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";
import * as groq from "./groq.js";
import * as gemini from "./gemini.js";
import * as openrouterFree from "./openrouter-free.js";
import { ALL_MODELS } from "../config/models.js";

const PROVIDERS: Record<
  ProviderId,
  {
    hasAuth: (settings?: Settings) => boolean;
    streamChat: (model: Model, ctx: ChatContext, settings?: Settings) => AsyncGenerator<StreamEvent>;
  }
> = {
  openai: openai,
  anthropic: anthropic,
  groq: groq,
  gemini: gemini,
  free: openrouterFree,
};

export function hasProviderAuth(provider: ProviderId, settings?: Settings): boolean {
  return PROVIDERS[provider].hasAuth(settings);
}

export function getAvailableModels(settings?: Settings): Model[] {
  return ALL_MODELS.filter((m) => hasProviderAuth(m.provider, settings));
}

export function streamChat(
  model: Model,
  ctx: ChatContext,
  settings?: Settings,
): AsyncGenerator<StreamEvent> {
  const provider = PROVIDERS[model.provider];
  return provider.streamChat(model, ctx, settings);
}

export function getDefaultModelForProvider(provider: ProviderId): Model | undefined {
  switch (provider) {
    case "openai":
      return openai.MODELS[0];
    case "anthropic":
      return anthropic.MODELS[0];
    case "groq":
      return groq.MODELS[0];
    case "gemini":
      return gemini.MODELS[0];
    case "free":
      return openrouterFree.MODELS[0];
  }
}

export const PROVIDER_ENV_VARS: Record<ProviderId, string[]> = {
  openai: [openai.API_KEY_ENV],
  anthropic: [anthropic.API_KEY_ENV],
  groq: [groq.API_KEY_ENV],
  gemini: [gemini.API_KEY_ENV, gemini.API_KEY_ENV_ALT],
  free: [openrouterFree.API_KEY_ENV],
};
