import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

export interface FixtureWorkspace {
  path: string;
  cleanup: () => void;
}

export function createFixtureWorkspace(opts?: {
  git?: boolean;
  files?: Record<string, string>;
}): FixtureWorkspace {
  const path = mkdtempSync(join(tmpdir(), "agent-eval-ws-"));
  if (opts?.files) {
    for (const [rel, content] of Object.entries(opts.files)) {
      const full = join(path, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
  }
  if (opts?.git) {
    execSync("git init", { cwd: path, stdio: "ignore" });
    execSync('git config user.email "eval@test.com"', { cwd: path, stdio: "ignore" });
    execSync('git config user.name "Eval"', { cwd: path, stdio: "ignore" });
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

export function readWorkspaceFile(workspace: FixtureWorkspace, relPath: string): string | null {
  const full = join(workspace.path, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

export function workspaceFileExists(workspace: FixtureWorkspace, relPath: string): boolean {
  return existsSync(join(workspace.path, relPath));
}

export function initWorkspaceGit(workspace: FixtureWorkspace): void {
  if (existsSync(join(workspace.path, ".git"))) return;
  execSync("git init", { cwd: workspace.path, stdio: "ignore" });
  execSync('git config user.email "eval@test.com"', { cwd: workspace.path, stdio: "ignore" });
  execSync('git config user.name "Eval"', { cwd: workspace.path, stdio: "ignore" });
  try {
    execSync("git add -A", { cwd: workspace.path, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: workspace.path, stdio: "ignore" });
  } catch {
    // empty workspace — nothing to commit
  }
}

export function getGitStatus(workspace: FixtureWorkspace): string {
  try {
    return execSync("git status --short", {
      cwd: workspace.path,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export function getGitDiff(workspace: FixtureWorkspace): string {
  try {
    return execSync("git diff", {
      cwd: workspace.path,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export function runInWorkspace(workspace: FixtureWorkspace, command: string): string {
  return execSync(command, { cwd: workspace.path, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function walkDir(dir: string, base: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(base, full);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      walkDir(full, base, files);
    } else {
      files.push(rel);
    }
  }
}

export function listWorkspaceFiles(workspace: FixtureWorkspace): string[] {
  const files: string[] = [];
  walkDir(workspace.path, workspace.path, files);
  return files.sort();
}
