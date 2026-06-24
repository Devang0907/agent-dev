import { existsSync, realpathSync } from "node:fs";
import { resolve, isAbsolute, sep, basename } from "node:path";
import { platform as osPlatform } from "node:os";

export function resolvePath(path: string, workdir: string): string {
  return isAbsolute(path) ? path : resolve(workdir, path);
}

function normalizePathForComparison(path: string): string {
  const resolved = resolve(path);
  try {
    if (existsSync(resolved)) {
      return realpathSync.native(resolved);
    }
    let current = resolved;
    const suffix: string[] = [];
    while (!existsSync(current)) {
      suffix.unshift(basename(current));
      const parent = resolve(current, "..");
      if (parent === current) break;
      current = parent;
    }
    const realBase = existsSync(current) ? realpathSync.native(current) : resolve(current);
    return suffix.length === 0 ? realBase : resolve(realBase, ...suffix);
  } catch {
    return resolved;
  }
}

function pathsEqual(a: string, b: string): boolean {
  if (osPlatform() === "win32") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function isPathInsideRoot(normalizedPath: string, normalizedRoot: string): boolean {
  if (pathsEqual(normalizedPath, normalizedRoot)) return true;
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
  const pathToCheck = osPlatform() === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const prefixToCheck = osPlatform() === "win32" ? prefix.toLowerCase() : prefix;
  return pathToCheck.startsWith(prefixToCheck);
}

export function assertWithinWorkdir(path: string, workdir: string): void {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedRoot = normalizePathForComparison(workdir);
  if (!isPathInsideRoot(normalizedPath, normalizedRoot)) {
    throw new Error(`Path outside working directory: ${path}`);
  }
}
