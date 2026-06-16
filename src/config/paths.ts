import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.AGENT_DEV_DIR ?? join(homedir(), ".agent-dev");
export const SETTINGS_PATH = join(CONFIG_DIR, "settings.json");
export const SESSIONS_DIR = join(CONFIG_DIR, "sessions");
export const LAST_SESSION_PATH = join(CONFIG_DIR, "last-session.json");
