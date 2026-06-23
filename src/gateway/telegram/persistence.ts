import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, TELEGRAM_SESSIONS_PATH } from "../../config/paths.js";

export interface TelegramSessionMap {
  [chatKey: string]: string;
}

function chatKey(chatId: number): string {
  return `telegram:${chatId}`;
}

export function loadTelegramSessionMap(): TelegramSessionMap {
  if (!existsSync(TELEGRAM_SESSIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(TELEGRAM_SESSIONS_PATH, "utf-8")) as TelegramSessionMap;
  } catch {
    return {};
  }
}

export function saveTelegramSessionMap(map: TelegramSessionMap): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TELEGRAM_SESSIONS_PATH, JSON.stringify(map, null, 2), "utf-8");
}

export function getSessionIdForChat(chatId: number): string | undefined {
  return loadTelegramSessionMap()[chatKey(chatId)];
}

export function setSessionIdForChat(chatId: number, sessionId: string): void {
  const map = loadTelegramSessionMap();
  map[chatKey(chatId)] = sessionId;
  saveTelegramSessionMap(map);
}

export function clearSessionIdForChat(chatId: number): void {
  const map = loadTelegramSessionMap();
  delete map[chatKey(chatId)];
  saveTelegramSessionMap(map);
}
