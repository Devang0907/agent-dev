import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TRACES_DIR } from "../../config/paths.js";
import type { AgentEvent, CoreAgentEvent } from "../loop.js";

export function createRunId(): string {
  return randomUUID().slice(0, 8);
}

export interface TraceRecord {
  timestamp: string;
  runId: string;
  workerId?: string;
  type: string;
  payload: unknown;
}

export function appendTraceEvent(
  sessionId: string,
  runId: string,
  record: Omit<TraceRecord, "timestamp" | "runId">,
): void {
  const dir = join(TRACES_DIR, sessionId);
  mkdirSync(dir, { recursive: true });
  const line: TraceRecord = {
    timestamp: new Date().toISOString(),
    runId,
    ...record,
  };
  appendFileSync(join(dir, `${runId}.jsonl`), JSON.stringify(line) + "\n", "utf-8");
}

export function wrapWorkerEvent(
  runId: string,
  workerId: string,
  event: CoreAgentEvent,
  onEvent: (event: AgentEvent) => void,
  sessionId?: string,
): void {
  const wrapped = { type: "agent_event" as const, runId, workerId, event };
  onEvent(wrapped);
  if (sessionId) {
    appendTraceEvent(sessionId, runId, { type: "agent_event", workerId, payload: event });
  }
}

export function getTracePath(sessionId: string, runId: string): string {
  return join(TRACES_DIR, sessionId, `${runId}.jsonl`);
}

export function getLatestTracePath(sessionId: string): string | null {
  const dir = join(TRACES_DIR, sessionId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) return null;
  let latest = files[0]!;
  let latestMtime = statSync(join(dir, latest)).mtimeMs;
  for (const file of files.slice(1)) {
    const mtime = statSync(join(dir, file)).mtimeMs;
    if (mtime > latestMtime) {
      latest = file;
      latestMtime = mtime;
    }
  }
  return join(dir, latest);
}
