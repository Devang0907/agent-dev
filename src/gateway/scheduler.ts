import type { Api } from "grammy";
import type { TelegramSessionBridge } from "./telegram/adapter.js";
import {
  computeNextDailyAt,
  loadSchedules,
  saveSchedules,
  type ScheduleEntry,
} from "../agent/tools/schedule.js";

const TICK_MS = 30_000;
const BUSY_RETRY_MS = 60_000;

export interface ScheduleRunnerOptions {
  api: Api;
  getBridge: (chatId: number) => TelegramSessionBridge | undefined;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduleRunner(options: ScheduleRunnerOptions): void {
  if (timer) return;

  const tick = () => {
    void processDueSchedules(options).catch((err) => {
      console.error("[scheduler] tick error:", err);
    });
  };

  timer = setInterval(tick, TICK_MS);
  tick();
  console.log("[scheduler] Reminder and daily task runner started");
}

export function stopScheduleRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function processDueSchedules(options: ScheduleRunnerOptions): Promise<void> {
  const store = loadSchedules();
  const now = Date.now();
  let changed = false;

  for (const entry of Object.values(store)) {
    if (!entry.enabled) continue;
    if (new Date(entry.nextFireAt).getTime() > now) continue;

    const fired = await fireScheduleEntry(entry, options);
    if (!fired) {
      entry.nextFireAt = new Date(Date.now() + BUSY_RETRY_MS).toISOString();
      changed = true;
      continue;
    }

    if (entry.dailyAt) {
      entry.nextFireAt = computeNextDailyAt(entry.dailyAt);
    } else {
      entry.enabled = false;
    }
    changed = true;
  }

  if (changed) saveSchedules(store);
}

async function fireScheduleEntry(
  entry: ScheduleEntry,
  options: ScheduleRunnerOptions,
): Promise<boolean> {
  const { api, getBridge } = options;

  if (entry.kind === "reminder") {
    try {
      await api.sendMessage(entry.chatId, `⏰ Reminder: ${entry.message}`);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder to chat ${entry.chatId}:`, err);
    }
    return true;
  }

  const bridge = getBridge(entry.chatId);
  if (!bridge) {
    console.warn(`[scheduler] No active bridge for chat ${entry.chatId} — task skipped`);
    return true;
  }

  if (bridge.session.isRunning()) {
    return false;
  }

  try {
    await api.sendChatAction(entry.chatId, "typing");
    await bridge.prompt(`[Scheduled task] ${entry.message}`);
  } catch (err) {
    console.error(`[scheduler] Failed to run task for chat ${entry.chatId}:`, err);
  }
  return true;
}
