import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.AGENT_DEV_DIR ?? join(homedir(), ".agent-dev");
export const SETTINGS_PATH = join(CONFIG_DIR, "settings.json");
export const SESSIONS_DIR = join(CONFIG_DIR, "sessions");
export const LAST_SESSION_PATH = join(CONFIG_DIR, "last-session.json");
export const MEMORY_PATH = join(CONFIG_DIR, "memory.json");
export const PLAN_PATH = join(CONFIG_DIR, "plan.json");
export const MCP_CONFIG_PATH = join(CONFIG_DIR, "mcp.json");
export const TRACES_DIR = join(CONFIG_DIR, "traces");
export const TELEGRAM_SESSIONS_PATH = join(CONFIG_DIR, "telegram-sessions.json");
export const SCHEDULES_PATH = join(CONFIG_DIR, "schedules.json");
export const BROWSER_PROFILES_DIR = join(CONFIG_DIR, "browser-profile");
export const SCREENSHOTS_DIR = join(CONFIG_DIR, "screenshots");
