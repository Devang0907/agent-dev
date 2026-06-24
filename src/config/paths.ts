import { homedir } from "node:os";
import { join } from "node:path";

export function getConfigDir(): string {
  return process.env.AGENT_DEV_DIR ?? join(homedir(), ".agent-dev");
}

export function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

export function getSessionsDir(): string {
  return join(getConfigDir(), "sessions");
}

export function getLastSessionPath(): string {
  return join(getConfigDir(), "last-session.json");
}

export function getMemoryPath(): string {
  return join(getConfigDir(), "memory.json");
}

export function getPlanPath(): string {
  return join(getConfigDir(), "plan.json");
}

export function getMcpConfigPath(): string {
  return join(getConfigDir(), "mcp.json");
}

export function getTracesDir(): string {
  return join(getConfigDir(), "traces");
}

export function getTelegramSessionsPath(): string {
  return join(getConfigDir(), "telegram-sessions.json");
}

export function getSchedulesPath(): string {
  return join(getConfigDir(), "schedules.json");
}

export function getBrowserProfilesDir(): string {
  return join(getConfigDir(), "browser-profile");
}

export function getScreenshotsDir(): string {
  return join(getConfigDir(), "screenshots");
}

/** @deprecated Use getConfigDir() */
export const CONFIG_DIR = getConfigDir();
/** @deprecated Use getSettingsPath() */
export const SETTINGS_PATH = getSettingsPath();
/** @deprecated Use getSessionsDir() */
export const SESSIONS_DIR = getSessionsDir();
/** @deprecated Use getLastSessionPath() */
export const LAST_SESSION_PATH = getLastSessionPath();
/** @deprecated Use getMemoryPath() */
export const MEMORY_PATH = getMemoryPath();
/** @deprecated Use getPlanPath() */
export const PLAN_PATH = getPlanPath();
/** @deprecated Use getMcpConfigPath() */
export const MCP_CONFIG_PATH = getMcpConfigPath();
/** @deprecated Use getTracesDir() */
export const TRACES_DIR = getTracesDir();
/** @deprecated Use getTelegramSessionsPath() */
export const TELEGRAM_SESSIONS_PATH = getTelegramSessionsPath();
/** @deprecated Use getSchedulesPath() */
export const SCHEDULES_PATH = getSchedulesPath();
/** @deprecated Use getBrowserProfilesDir() */
export const BROWSER_PROFILES_DIR = getBrowserProfilesDir();
/** @deprecated Use getScreenshotsDir() */
export const SCREENSHOTS_DIR = getScreenshotsDir();
