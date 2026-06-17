import { resolve, isAbsolute } from "node:path";

export function resolvePath(path: string, workdir: string): string {
  return isAbsolute(path) ? path : resolve(workdir, path);
}

export function assertWithinWorkdir(path: string, workdir: string): void {
  const resolved = resolve(path);
  const root = resolve(workdir);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path outside working directory: ${path}`);
  }
}
