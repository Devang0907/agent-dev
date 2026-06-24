import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface TmpWorkspace {
  path: string;
  cleanup: () => void;
}

export function createTmpWorkspace(opts?: { git?: boolean; files?: Record<string, string> }): TmpWorkspace {
  const path = mkdtempSync(join(tmpdir(), "agent-dev-ws-"));
  if (opts?.files) {
    for (const [rel, content] of Object.entries(opts.files)) {
      const full = join(path, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
  }
  if (opts?.git) {
    execSync("git init", { cwd: path, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: path, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: path, stdio: "ignore" });
  }
  return {
    path,
    cleanup: () => {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}
