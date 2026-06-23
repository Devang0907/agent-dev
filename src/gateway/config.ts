import { resolve } from "node:path";
import { loadSettings } from "../config/settings.js";

export interface TelegramGatewayConfig {
  botToken: string;
  allowedUserIds: number[];
  workdir: string;
}

export interface TelegramGatewayOptions {
  workdir?: string;
  verbose?: boolean;
}

export function loadTelegramConfig(options: TelegramGatewayOptions = {}): TelegramGatewayConfig {
  const settings = loadSettings();
  const telegram = settings.telegram ?? {};

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || telegram.botToken?.trim();
  if (!botToken) {
    throw new Error(
      "Telegram bot token required. Set TELEGRAM_BOT_TOKEN or telegram.botToken in ~/.agent-dev/settings.json",
    );
  }

  const envIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.trim();
  let allowedUserIds: number[] = telegram.allowedUserIds ?? [];
  if (envIds) {
    allowedUserIds = envIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
  }

  const workdir = resolve(options.workdir ?? telegram.workdir ?? process.cwd());

  return { botToken, allowedUserIds, workdir };
}

export function isUserAllowed(userId: number, allowedUserIds: number[]): boolean {
  if (allowedUserIds.length === 0) return false;
  return allowedUserIds.includes(userId);
}
