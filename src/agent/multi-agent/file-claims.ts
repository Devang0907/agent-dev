import { isAbsolute, relative, resolve } from "node:path";
import { AUDIT_DIR_PREFIX } from "./agents.js";

/**
 * Normalize a path to a workdir-relative, forward-slash, lowercase form so
 * claims compare consistently across agents (Windows paths included).
 * Returns null for paths outside the workdir.
 */
export function normalizeClaimPath(path: string, workdir: string): string | null {
  const abs = isAbsolute(path) ? path : resolve(workdir, path);
  const rel = relative(workdir, abs).replace(/\\/g, "/");
  if (rel.startsWith("../") || rel === "..") return null;
  return rel.toLowerCase();
}

/** Paths every agent may always write (audit files, plan docs). */
export function isAlwaysWritablePath(normalizedRel: string): boolean {
  return (
    normalizedRel.startsWith(`${AUDIT_DIR_PREFIX.toLowerCase()}/`) ||
    normalizedRel.startsWith(".agent-dev/plans/")
  );
}

export interface ClaimConflict {
  path: string;
  ownerRunId: string;
}

/**
 * Tracks which files each live agent run has claimed. Claims from different
 * runs must be disjoint; a run may only write files it claimed.
 */
export class FileClaimRegistry {
  private claims = new Map<string, Set<string>>(); // runId -> normalized paths
  private owners = new Map<string, string>(); // normalized path -> runId

  constructor(private workdir: string) {}

  /**
   * Claim paths for a run. Rejects (without claiming anything) if any path is
   * already claimed by another live run.
   */
  claim(runId: string, paths: string[]): { ok: true } | { ok: false; conflict: ClaimConflict } {
    const normalized: string[] = [];
    for (const p of paths) {
      const n = normalizeClaimPath(p, this.workdir);
      if (!n) continue;
      const owner = this.owners.get(n);
      if (owner && owner !== runId) {
        return { ok: false, conflict: { path: p, ownerRunId: owner } };
      }
      normalized.push(n);
    }
    const set = this.claims.get(runId) ?? new Set<string>();
    for (const n of normalized) {
      set.add(n);
      this.owners.set(n, runId);
    }
    this.claims.set(runId, set);
    return { ok: true };
  }

  release(runId: string): void {
    const set = this.claims.get(runId);
    if (!set) return;
    for (const n of set) {
      if (this.owners.get(n) === runId) this.owners.delete(n);
    }
    this.claims.delete(runId);
  }

  /**
   * Guard consulted before write/edit/diff. Returns a block message if the
   * path is claimed by another live run, or outside this run's claimed scope
   * (when the run has a declared scope).
   */
  checkWrite(runId: string, path: string, hasDeclaredScope: boolean): string | null {
    const n = normalizeClaimPath(path, this.workdir);
    if (!n) {
      return `Blocked: "${path}" is outside the project directory.`;
    }
    if (isAlwaysWritablePath(n)) return null;
    const owner = this.owners.get(n);
    if (owner && owner !== runId) {
      return `Blocked: "${path}" is claimed by concurrent agent run #${owner}. Do not modify it; report back if your task requires this file.`;
    }
    if (hasDeclaredScope && (!owner || owner !== runId)) {
      return `Blocked: "${path}" is not in your declared files_touched scope. Stop and report back instead of editing files outside your scope.`;
    }
    return null;
  }

  claimedPaths(runId: string): string[] {
    return [...(this.claims.get(runId) ?? [])];
  }
}

const FILE_WRITE_TOOLS = new Set(["write", "edit", "diff"]);

/**
 * Guard consulted by the agent loop before write/edit/diff when a run has a
 * declared file scope (multi-agent mode). Returns a block message or null.
 */
export function checkFileScopeBlock(
  name: string,
  args: Record<string, unknown>,
  workdir: string,
  fileScope?: string[],
  fileWriteGuard?: (path: string) => string | null,
): string | null {
  if (!fileScope && !fileWriteGuard) return null;
  if (!FILE_WRITE_TOOLS.has(name)) return null;
  const path = typeof args.path === "string" ? args.path : "";
  if (!path) return null;

  const normalized = normalizeClaimPath(path, workdir);
  if (!normalized) {
    return `Blocked: "${path}" is outside the project directory.`;
  }
  if (isAlwaysWritablePath(normalized)) return null;

  if (fileScope) {
    const scopeSet = new Set(
      fileScope
        .map((p) => normalizeClaimPath(p, workdir))
        .filter((p): p is string => p !== null),
    );
    if (!scopeSet.has(normalized)) {
      return `Blocked: "${path}" is not in your declared files_touched scope (${fileScope.join(", ")}). Stop and report back instead of editing files outside your scope.`;
    }
  }

  return fileWriteGuard ? fileWriteGuard(path) : null;
}
