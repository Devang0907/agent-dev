import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentSession } from "../../src/agent/session.js";
import type { SessionEvent } from "../../src/agent/session.js";
import { SessionManager } from "../../src/session/manager.js";
import type { Model } from "../../src/providers/types.js";
import type { Settings } from "../../src/config/settings.js";
import type { EvalTurn, EvalContext } from "../scenarios/types.js";
import type { FixtureWorkspace } from "../fixtures/workspace.js";
import { MetricsCollector } from "../metrics/collector.js";
import { evaluateApproval, type ApprovalPolicy } from "../mocks/approval-policy.js";
import type { ToolExecuteHook } from "../mocks/tool-interceptor.js";
import { getGitStatus, getGitDiff } from "../fixtures/workspace.js";

export interface HarnessResult {
  events: SessionEvent[];
  metrics: ReturnType<MetricsCollector["snapshot"]>;
  workspaceState: {
    gitStatus: string;
    gitDiff: string;
  };
}

export class EvalHarness {
  private events: SessionEvent[] = [];
  private collector = new MetricsCollector();
  private defaultApproval: ApprovalPolicy;
  private turnApproval: ApprovalPolicy | null = null;
  private toolExecuteHook?: ToolExecuteHook;

  constructor(
    private workspace: FixtureWorkspace,
    private settings: Settings,
    private model: Model,
    defaultApproval: ApprovalPolicy = "selective",
  ) {
    this.defaultApproval = defaultApproval;
  }

  setToolExecuteHook(hook?: ToolExecuteHook): void {
    this.toolExecuteHook = hook;
  }

  createSession(): AgentSession {
    const sessionManager = new SessionManager(undefined, this.workspace.path);
    const session = new AgentSession(this.settings, sessionManager, this.workspace.path, this.model);
    if (this.toolExecuteHook) {
      session.setToolExecuteHook(this.toolExecuteHook);
    }

    session.on("event", (event: SessionEvent) => {
      this.events.push(event);
      this.collector.recordEvent(event);

      if (event.type === "permission_request") {
        const policy = this.turnApproval ?? this.defaultApproval;
        const decision = evaluateApproval(policy, event.request);
        session.respondToPermission(decision.approved);
      }

      if (event.type === "interaction_request") {
        session.respondToInteraction(null);
      }

      if (event.type === "tool_call") {
        try {
          const args = JSON.parse(event.toolCall.arguments || "{}") as Record<string, unknown>;
          this.collector.recordToolCall(event.toolCall.name, args);
        } catch {
          // ignore
        }
      }
    });

    return session;
  }

  buildContext(session: AgentSession): EvalContext {
    return {
      workspace: this.workspace,
      session,
      events: this.events,
      metrics: this.collector.snapshot(0),
      artifacts: new Map(),
      model: this.model,
      settings: this.settings,
    };
  }

  async runTurns(session: AgentSession, turns: EvalTurn[], timeoutMs: number): Promise<void> {
    for (const turn of turns) {
      this.turnApproval = turn.approvalPolicy ?? null;
      const turnTimeout = timeoutMs;

      await Promise.race([
        (async () => {
          await session.prompt(turn.prompt);
          await session.waitForIdle(turnTimeout);
        })(),
        new Promise<void>((_, reject) =>
          setTimeout(() => {
            session.abort();
            reject(new Error("Turn timeout"));
          }, turnTimeout),
        ),
      ]);

      if (turn.afterTurn) {
        const ctx = this.buildContext(session);
        await turn.afterTurn(ctx);
      }
    }
    this.turnApproval = null;
  }

  getResult(turnCount: number): HarnessResult {
    return {
      events: [...this.events],
      metrics: this.collector.snapshot(turnCount),
      workspaceState: {
        gitStatus: getGitStatus(this.workspace),
        gitDiff: getGitDiff(this.workspace),
      },
    };
  }

  writeTrace(reportDir: string, scenarioId: string): void {
    const dir = join(reportDir, scenarioId);
    mkdirSync(dir, { recursive: true });
    const tracePath = join(dir, "trace.jsonl");
    for (const event of this.events) {
      appendFileSync(tracePath, JSON.stringify({ timestamp: new Date().toISOString(), event }) + "\n");
    }
    writeFileSync(join(dir, "workspace-state.json"), JSON.stringify(this.getResult(0).workspaceState, null, 2));
  }
}
