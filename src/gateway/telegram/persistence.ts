import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir, getTelegramSessionsPath } from "../../config/paths.js";

export const getTelegramWelcomedPath = () => join(getConfigDir(), "telegram-welcomed.json");

export interface TelegramSessionMap {
  [chatKey: string]: string;
}

function chatKey(chatId: number): string {
  return `telegram:${chatId}`;
}

export function loadTelegramSessionMap(): TelegramSessionMap {
  if (!existsSync(getTelegramSessionsPath())) return {};
  try {
    return JSON.parse(readFileSync(getTelegramSessionsPath(), "utf-8")) as TelegramSessionMap;
  } catch {
    return {};
  }
}

export function saveTelegramSessionMap(map: TelegramSessionMap): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getTelegramSessionsPath(), JSON.stringify(map, null, 2), "utf-8");
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

interface WelcomedStore {
  userIds: number[];
}

function loadWelcomedStore(): WelcomedStore {
  if (!existsSync(getTelegramWelcomedPath())) return { userIds: [] };
  try {
    const parsed = JSON.parse(readFileSync(getTelegramWelcomedPath(), "utf-8")) as WelcomedStore;
    return { userIds: Array.isArray(parsed.userIds) ? parsed.userIds : [] };
  } catch {
    return { userIds: [] };
  }
}

function saveWelcomedStore(store: WelcomedStore): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getTelegramWelcomedPath(), JSON.stringify(store, null, 2), "utf-8");
}

export function hasWelcomedUser(userId: number): boolean {
  return loadWelcomedStore().userIds.includes(userId);
}

export function markUserWelcomed(userId: number): void {
  const store = loadWelcomedStore();
  if (store.userIds.includes(userId)) return;
  store.userIds.push(userId);
  saveWelcomedStore(store);
}
