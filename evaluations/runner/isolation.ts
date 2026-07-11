import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface IsolationContext {
  agentDevDir: string;
  cleanup: () => void;
}

export function createIsolationContext(): IsolationContext {
  const agentDevDir = mkdtempSync(join(tmpdir(), "agent-eval-config-"));
  mkdirSync(join(agentDevDir, "sessions"), { recursive: true });
  const prev = process.env.AGENT_DEV_DIR;
  process.env.AGENT_DEV_DIR = agentDevDir;

  return {
    agentDevDir,
    cleanup: () => {
      if (prev === undefined) {
        delete process.env.AGENT_DEV_DIR;
      } else {
        process.env.AGENT_DEV_DIR = prev;
      }
      try {
        rmSync(agentDevDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}
