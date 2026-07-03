import type { Model } from "../../providers/types.js";
import type { Settings } from "../../config/settings.js";
import type { AgentEvent, PermissionRequest, InteractionRequest, runAgentLoop } from "../loop.js";
import type { MultiAgentProfile } from "./agents.js";
import { FileClaimRegistry } from "./file-claims.js";

export interface MultiAgentContext {
  sessionId: string;
  /** Model the boss itself runs on; also the fallback for workers. */
  bossModel: Model;
  settings: Settings;
  workdir: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>;
  onInteractionRequest?: (request: InteractionRequest) => Promise<string | null>;
  /** Custom agent profiles from multi_agents.md (null = defaults only). */
  customAgents: MultiAgentProfile[] | null;
  claims: FileClaimRegistry;
  spawnCount: number;
  maxSpawnsPerTurn: number;
  maxParallel: number;
  /** Test seam: replaces runAgentLoop for spawned workers. */
  loopRunner?: typeof runAgentLoop;
}

let activeMultiAgentContext: MultiAgentContext | null = null;

export function setMultiAgentContext(ctx: MultiAgentContext | null): void {
  activeMultiAgentContext = ctx;
}

export function getMultiAgentContext(): MultiAgentContext | null {
  return activeMultiAgentContext;
}

export const MAX_SPAWNS_PER_TURN = Number(process.env.AGENT_MAX_SPAWNS) || 12;

export function createClaimRegistry(workdir: string): FileClaimRegistry {
  return new FileClaimRegistry(workdir);
}
