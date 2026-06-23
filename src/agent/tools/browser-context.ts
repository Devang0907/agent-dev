import type { BrowserSettings } from "./browser/types.js";

export interface BrowserToolContext {
  sessionId: string;
  toolCallId: string;
  settings: BrowserSettings;
  onProgress: (message: string) => void;
  requestUserStep: (reason: string) => Promise<void>;
  requestUserInput: (reason: string, placeholder?: string) => Promise<string | null>;
}

let activeBrowserContext: BrowserToolContext | null = null;

export function setBrowserContext(ctx: BrowserToolContext | null): void {
  activeBrowserContext = ctx;
}

export function getBrowserContext(): BrowserToolContext | null {
  return activeBrowserContext;
}
