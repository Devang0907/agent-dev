import type { SessionEvent } from "../../src/agent/session.js";

export interface MetricsSnapshot {
  toolCallsByName: Record<string, number>;
  toolRounds: number;
  retries: number;
  permissionRequests: number;
  deniedCommands: number;
  contextPeakTokens: number;
  compactions: number;
  wallTimeMs: number;
  turnCount: number;
  completionStatus: "completed" | "error" | "timeout" | "aborted" | "unknown";
  unnecessaryReads: number;
  planUpdates: number;
  errors: number;
  textLength: number;
}

export class MetricsCollector {
  private toolCallsByName = new Map<string, number>();
  private toolSignatures = new Map<string, number>();
  private readFiles = new Map<string, number>();
  private lastEditTurn = -1;
  private currentTurn = 0;
  private toolRounds = 0;
  private permissionRequests = 0;
  private deniedCommands = 0;
  private contextPeakTokens = 0;
  private compactions = 0;
  private planUpdates = 0;
  private errors = 0;
  private textLength = 0;
  private hadToolCallThisRound = false;
  private completionStatus: MetricsSnapshot["completionStatus"] = "unknown";
  private startTime = Date.now();

  recordEvent(event: SessionEvent): void {
    if (event.type === "user_message") {
      if (this.hadToolCallThisRound) {
        this.toolRounds++;
        this.hadToolCallThisRound = false;
      }
      this.currentTurn++;
    } else if (event.type === "tool_call") {
      this.hadToolCallThisRound = true;
      const name = event.toolCall.name;
      this.toolCallsByName.set(name, (this.toolCallsByName.get(name) ?? 0) + 1);
      const sig = `${name}:${event.toolCall.arguments}`;
      this.toolSignatures.set(sig, (this.toolSignatures.get(sig) ?? 0) + 1);
    } else if (event.type === "tool_result") {
      if (/denied/i.test(event.result)) {
        this.deniedCommands++;
      }
      if (event.name === "read" && event.result && !event.result.startsWith("Error:")) {
        // track reads via preceding tool_call args is harder; count from results
      }
      if (event.name === "plan" && !event.result.startsWith("Error:")) {
        this.planUpdates++;
      }
    } else if (event.type === "permission_request") {
      this.permissionRequests++;
    } else if (event.type === "context_usage") {
      const tokens = event.estimatedTotal ?? (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
      if (tokens > this.contextPeakTokens) this.contextPeakTokens = tokens;
    } else if (event.type === "compaction_done") {
      this.compactions++;
    } else if (event.type === "text_delta") {
      this.textLength += event.delta.length;
    } else if (event.type === "turn_end") {
      if (this.hadToolCallThisRound) {
        this.toolRounds++;
        this.hadToolCallThisRound = false;
      }
      this.completionStatus = "completed";
    } else if (event.type === "error") {
      this.errors++;
      this.completionStatus = "error";
    }
  }

  recordToolCall(name: string, args: Record<string, unknown>): void {
    if (name === "read" && typeof args.path === "string") {
      const path = args.path;
      const count = (this.readFiles.get(path) ?? 0) + 1;
      this.readFiles.set(path, count);
      if (count > 1 && this.lastEditTurn < this.currentTurn - 1) {
        // counted in snapshot
      }
    }
    if (name === "edit" || name === "write") {
      this.lastEditTurn = this.currentTurn;
    }
  }

  setCompletionStatus(status: MetricsSnapshot["completionStatus"]): void {
    this.completionStatus = status;
  }

  snapshot(turnCount: number): MetricsSnapshot {
    let retries = 0;
    for (const count of this.toolSignatures.values()) {
      if (count > 1) retries += count - 1;
    }

    let unnecessaryReads = 0;
    for (const count of this.readFiles.values()) {
      if (count > 1) unnecessaryReads += count - 1;
    }

    const toolCallsByName: Record<string, number> = {};
    for (const [name, count] of this.toolCallsByName) {
      toolCallsByName[name] = count;
    }

    return {
      toolCallsByName,
      toolRounds: this.toolRounds,
      retries,
      permissionRequests: this.permissionRequests,
      deniedCommands: this.deniedCommands,
      contextPeakTokens: this.contextPeakTokens,
      compactions: this.compactions,
      wallTimeMs: Date.now() - this.startTime,
      turnCount,
      completionStatus: this.completionStatus,
      unnecessaryReads,
      planUpdates: this.planUpdates,
      errors: this.errors,
      textLength: this.textLength,
    };
  }
}
