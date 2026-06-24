import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findGitRoot(start: string): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/** Directories from start up to stop (inclusive), leaf-first order. */
export function walkUpDirs(start: string, stop: string): string[] {
  const dirs: string[] = [];
  let current = resolve(start);
  const stopAt = resolve(stop);

  while (true) {
    dirs.push(current);
    if (current === stopAt) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs;
}

/** Directories from git root down to start (root-to-leaf). */
export function walkRootToLeaf(start: string, stop?: string): string[] {
  const gitRoot = stop ?? findGitRoot(start);
  return walkUpDirs(start, gitRoot).reverse();
}
