import type { Model, ProviderId } from "../providers/types.js";
import { MODELS as ANTHROPIC_MODELS } from "../providers/anthropic.js";
import { MODELS as FREE_MODELS, resolveFreeModelId } from "../providers/openrouter-free.js";

const CTX_128K = 128_000;
const CTX_200K = 200_000;
const CTX_32K = 32_000;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI (ChatGPT)",
  anthropic: "Anthropic (Claude)",
  groq: "Groq",
  gemini: "Google Gemini",
  free: "Free (OpenRouter)",
};

export const ALL_MODELS: Model[] = [
  { provider: "openai", id: "gpt-4o", name: "GPT-4o", contextWindow: CTX_128K },
  { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: CTX_128K },
  { provider: "openai", id: "gpt-4.1", name: "GPT-4.1", contextWindow: CTX_128K },
  { provider: "openai", id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: CTX_128K },
  { provider: "openai", id: "o4-mini", name: "o4-mini", contextWindow: CTX_128K },
  { provider: "openai", id: "o3-mini", name: "o3-mini", contextWindow: CTX_128K },
  ...ANTHROPIC_MODELS,
  { provider: "groq", id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: CTX_128K },
  { provider: "groq", id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", contextWindow: CTX_128K },
  { provider: "groq", id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", contextWindow: CTX_32K },
  { provider: "groq", id: "gemma2-9b-it", name: "Gemma 2 9B", contextWindow: CTX_32K },
  { provider: "gemini", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: CTX_200K },
  { provider: "gemini", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: CTX_200K },
  { provider: "gemini", id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: CTX_200K },
  ...FREE_MODELS.map((m) => ({ ...m, contextWindow: m.contextWindow ?? CTX_32K })),
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
