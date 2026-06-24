import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigDir } from "../config/paths.js";

export const PACKAGE_NAME = "@devang0907/agent-dev";
export const UPDATE_COMMAND = "npm update -g @devang0907/agent-dev";

const cachePath = () => join(getConfigDir(), "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; agent-dev/1.0; +https://github.com/Devang0907/agent-dev)";

export interface UpdateInfo {
  current: string;
  latest: string;
}

interface UpdateCache {
  checkedAt: number;
  latest: string;
}

function findPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const path = join(dir, "package.json");
    if (existsSync(path)) {
      try {
        const pkg = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
        if (pkg.name === PACKAGE_NAME && pkg.version) return pkg.version;
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir);
  }
  return "0.0.0";
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readCache(): UpdateCache | null {
  if (!existsSync(cachePath())) return null;
  try {
    return JSON.parse(readFileSync(cachePath(), "utf8")) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const meta = (await res.json()) as { "dist-tags"?: { latest?: string } };
    return meta["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}

export function getCurrentVersion(): string {
  return findPackageVersion();
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const current = getCurrentVersion();
  const cache = readCache();
  const now = Date.now();
  let latest: string | null = null;

  if (cache && now - cache.checkedAt < CHECK_INTERVAL_MS) {
    latest = cache.latest;
  } else {
    latest = await fetchLatestVersion();
    if (latest) {
      writeCache({ checkedAt: now, latest });
    } else if (cache) {
      latest = cache.latest;
    }
  }

  if (!latest || compareSemver(current, latest) >= 0) return null;
  return { current, latest };
}
