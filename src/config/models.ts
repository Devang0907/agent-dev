import type { Model, ProviderId } from "../providers/types.js";
import { MODELS as ANTHROPIC_MODELS } from "../providers/anthropic.js";
import { MODELS as FREE_MODELS, resolveFreeModelId } from "../providers/openrouter-free.js";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI (ChatGPT)",
  anthropic: "Anthropic (Claude)",
  groq: "Groq",
  gemini: "Google Gemini",
  free: "Free (OpenRouter)",
};

export const ALL_MODELS: Model[] = [
  { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { provider: "openai", id: "gpt-4.1", name: "GPT-4.1" },
  { provider: "openai", id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
  { provider: "openai", id: "o4-mini", name: "o4-mini" },
  { provider: "openai", id: "o3-mini", name: "o3-mini" },
  ...ANTHROPIC_MODELS,
  { provider: "groq", id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
  { provider: "groq", id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
  { provider: "groq", id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
  { provider: "groq", id: "gemma2-9b-it", name: "Gemma 2 9B" },
  { provider: "gemini", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { provider: "gemini", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { provider: "gemini", id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ...FREE_MODELS,
];

export function findModel(provider: ProviderId, id: string): Model | undefined {
  const resolvedId = provider === "free" ? resolveFreeModelId(id) : id;
  return ALL_MODELS.find((m) => m.provider === provider && m.id === resolvedId);
}

export function parseModelRef(ref: string): Model | undefined {
  const slash = ref.indexOf("/");
  if (slash === -1) return undefined;
  const provider = ref.slice(0, slash) as ProviderId;
  const id = ref.slice(slash + 1);
  return findModel(provider, id);
}

export function modelRef(model: Model): string {
  return `${model.provider}/${model.id}`;
}
