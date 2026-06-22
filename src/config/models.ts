import type { Model, ProviderId } from "../providers/types.js";
import { MODELS as FREE_MODELS, resolveFreeModelId } from "../providers/openrouter-free.js";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI (ChatGPT)",
  groq: "Groq",
  gemini: "Google Gemini",
  free: "Free (OpenRouter)",
};

export const ALL_MODELS: Model[] = [
  { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { provider: "groq", id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
  { provider: "groq", id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
  { provider: "gemini", id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { provider: "gemini", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
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
