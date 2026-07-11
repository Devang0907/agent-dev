import type { PermissionRequest } from "../../src/agent/loop.js";

export type ApprovalPolicy = "auto" | "deny" | "selective";

export interface ApprovalDecision {
  approved: boolean;
  reason: string;
}

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /git\s+reset\s+--hard/i,
  /git\s+push\s+--force/i,
  /format-volume/i,
  /del\s+\/[sq]/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
];

export function evaluateApproval(
  policy: ApprovalPolicy,
  request: PermissionRequest,
): ApprovalDecision {
  const cmd = request.command ?? "";

  if (policy === "auto") {
    return { approved: true, reason: "auto-approved" };
  }

  if (policy === "deny") {
    const isDangerous = DANGEROUS_PATTERNS.some((p) => p.test(cmd));
    if (isDangerous || request.name === "bash" || request.name === "exec" || request.name === "git") {
      return { approved: false, reason: "deny-policy" };
    }
    return { approved: true, reason: "non-dangerous allowed under deny policy" };
  }

  // selective: deny dangerous, allow safe
  if (DANGEROUS_PATTERNS.some((p) => p.test(cmd))) {
    return { approved: false, reason: "dangerous command blocked" };
  }
  return { approved: true, reason: "selective-allow" };
}
