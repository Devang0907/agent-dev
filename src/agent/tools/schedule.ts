import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { getSchedulesPath } from "../../config/paths.js";
import { getScheduleContext } from "./schedule-context.js";

export type ScheduleKind = "reminder" | "task";

export interface ScheduleEntry {
  id: string;
  kind: ScheduleKind;
  message: string;
  chatId: number;
  userId?: number;
  nextFireAt: string;
  dailyAt?: string;
  createdAt: string;
  enabled: boolean;
}

type ScheduleStore = Record<string, ScheduleEntry>;

export const scheduleTool: ToolDefinition = {
  name: "schedule",
  description:
    "Schedule reminders and recurring tasks delivered via Telegram while the gateway is running. " +
    "Use for requests like 'remind me in 5 minutes', 'send me daily news at 8am'. " +
    "kind=reminder sends a simple notification; kind=task runs the agent with your message when due.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "add | list | cancel",
      },
      message: {
        type: "string",
        description: "Reminder text or agent task instruction (required for add)",
      },
      kind: {
        type: "string",
        description: "reminder (notification only) or task (agent executes message). Default: reminder",
      },
      in_minutes: {
        type: "number",
        description: "Fire once after this many minutes (for relative one-shot schedules)",
      },
      at: {
        type: "string",
        description: "Fire once at ISO datetime (alternative to in_minutes)",
      },
      daily_at: {
        type: "string",
        description: "Recurring daily at HH:MM 24h local time, e.g. 08:00 for morning news",
      },
      id: {
        type: "string",
        description: "Schedule id (required for cancel)",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

export function loadSchedules(): ScheduleStore {
  if (!existsSync(getSchedulesPath())) return {};
  try {
    return JSON.parse(readFileSync(getSchedulesPath(), "utf-8")) as ScheduleStore;
  } catch {
    return {};
  }
}

export function saveSchedules(store: ScheduleStore): void {
  mkdirSync(dirname(getSchedulesPath()), { recursive: true });
  writeFileSync(getSchedulesPath(), JSON.stringify(store, null, 2), "utf-8");
}

export function computeNextDailyAt(dailyAt: string, from = new Date()): string {
  const match = dailyAt.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid daily_at "${dailyAt}" — use HH:MM (e.g. 08:00)`);

  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid daily_at "${dailyAt}" — hours must be 0-23 and minutes 0-59`);
  }

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function newScheduleId(): string {
  return `sched_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

function formatScheduleLine(entry: ScheduleEntry): string {
  const when = entry.dailyAt
    ? `daily at ${entry.dailyAt}`
    : `at ${new Date(entry.nextFireAt).toLocaleString()}`;
  return `${entry.id} [${entry.kind}] ${when}: ${entry.message}`;
}

export async function executeSchedule(args: {
  action: string;
  message?: string;
  kind?: string;
  in_minutes?: number;
  at?: string;
  daily_at?: string;
  id?: string;
}): Promise<string> {
  const action = args.action?.trim().toLowerCase();
  if (!action) return "Error: action is required";

  const store = loadSchedules();

  if (action === "list") {
    const entries = Object.values(store)
      .filter((e) => e.enabled)
      .sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt));
    if (entries.length === 0) return "No active schedules.";
    return entries.map(formatScheduleLine).join("\n");
  }

  if (action === "cancel") {
    const id = args.id?.trim();
    if (!id) return "Error: id is required for cancel";
    const entry = store[id];
    if (!entry) return `No schedule found with id "${id}"`;
    entry.enabled = false;
    saveSchedules(store);
    return `Cancelled schedule ${id}`;
  }

  if (action === "add") {
    const ctx = getScheduleContext();
    if (!ctx?.chatId) {
      return "Error: scheduling requires the Telegram gateway. Start it with `agent telegram` and send your request from Telegram.";
    }

    const message = args.message?.trim();
    if (!message) return "Error: message is required for add";

    const kindRaw = args.kind?.trim().toLowerCase() ?? "reminder";
    if (kindRaw !== "reminder" && kindRaw !== "task") {
      return `Error: kind must be "reminder" or "task", got "${kindRaw}"`;
    }
    const kind = kindRaw as ScheduleKind;

    const dailyAt = args.daily_at?.trim();
    const hasDaily = Boolean(dailyAt);
    const hasInMinutes = args.in_minutes !== undefined && args.in_minutes !== null;
    const hasAt = Boolean(args.at?.trim());

    const timingCount = [hasDaily, hasInMinutes, hasAt].filter(Boolean).length;
    if (timingCount !== 1) {
      return "Error: specify exactly one of in_minutes, at, or daily_at";
    }

    let nextFireAt: string;
    let storedDailyAt: string | undefined;

    if (hasDaily) {
      storedDailyAt = dailyAt!;
      try {
        nextFireAt = computeNextDailyAt(storedDailyAt);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else if (hasInMinutes) {
      const minutes = Number(args.in_minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return "Error: in_minutes must be a positive number";
      }
      nextFireAt = new Date(Date.now() + minutes * 60_000).toISOString();
    } else {
      const parsed = new Date(args.at!.trim());
      if (Number.isNaN(parsed.getTime())) {
        return `Error: invalid at datetime "${args.at}"`;
      }
      if (parsed.getTime() <= Date.now()) {
        return "Error: at must be in the future";
      }
      nextFireAt = parsed.toISOString();
    }

    const id = newScheduleId();
    const entry: ScheduleEntry = {
      id,
      kind,
      message,
      chatId: ctx.chatId,
      userId: ctx.userId,
      nextFireAt,
      dailyAt: storedDailyAt,
      createdAt: new Date().toISOString(),
      enabled: true,
    };

    store[id] = entry;
    saveSchedules(store);

    const whenLabel = storedDailyAt
      ? `every day at ${storedDailyAt}`
      : new Date(nextFireAt).toLocaleString();
    return `Scheduled ${kind} ${id} — ${whenLabel}: "${message}"`;
  }

  return `Error: unknown action "${action}". Use add, list, or cancel.`;
}

export function loadScheduleSummary(maxEntries = 8): string {
  const store = loadSchedules();
  const entries = Object.values(store)
    .filter((e) => e.enabled)
    .sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt))
    .slice(0, maxEntries);
  if (entries.length === 0) return "";
  return entries.map(formatScheduleLine).join("\n");
}
