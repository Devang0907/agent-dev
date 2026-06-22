import type { Model } from "../../providers/types.js";
import type { Settings } from "../../config/settings.js";
import type { AgentEvent, PermissionRequest } from "../loop.js";

export interface DelegationContext {
  sessionId: string;
  model: Model;
  settings: Settings;
  workdir: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onPermissionRequest?: (request: PermissionRequest) => Promise<boolean>;
  delegationCount: number;
  maxDelegations: number;
}

let activeDelegationContext: DelegationContext | null = null;

export function setDelegationContext(ctx: DelegationContext | null): void {
  activeDelegationContext = ctx;
}

export function getDelegationContext(): DelegationContext | null {
  return activeDelegationContext;
}

export function incrementDelegationCount(): number {
  if (!activeDelegationContext) return 0;
  activeDelegationContext.delegationCount += 1;
  return activeDelegationContext.delegationCount;
}

export const MAX_DELEGATIONS_PER_TURN =
  Number(process.env.AGENT_MAX_DELEGATIONS) || 10;
