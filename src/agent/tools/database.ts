import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { ToolDefinition } from "../../providers/types.js";
import { resolvePath, assertWithinWorkdir } from "./paths.js";

export const databaseTool: ToolDefinition = {
  name: "database",
  description:
    "Run SQL against a SQLite database file. SELECT queries run freely; INSERT/UPDATE/DELETE require user approval.",
  parameters: {
    type: "object",
    properties: {
      database: { type: "string", description: "Path to .sqlite / .db file (relative to project)" },
      query: { type: "string", description: "SQL query to execute" },
    },
    required: ["database", "query"],
    additionalProperties: false,
  },
};

export function isSelectOnlyQuery(query: string): boolean {
  const q = query.trim().replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const first = q.split(";").map((s) => s.trim()).find(Boolean) ?? "";
  return /^select\b/i.test(first) || /^pragma\b/i.test(first) || /^explain\b/i.test(first);
}

export function formatDatabasePermissionCommand(args: Record<string, unknown>): string {
  const db = String(args.database ?? "");
  const query = String(args.query ?? "").trim();
  const preview = query.length > 120 ? query.slice(0, 120) + "…" : query;
  return `sqlite3 ${db} — ${preview}`;
}

function runSqlite(dbPath: string, query: string): string {
  const result = spawnSync("sqlite3", [dbPath, query], {
    encoding: "utf-8",
    maxBuffer: 4_000_000,
    windowsHide: true,
  });

  if (result.error) {
    return `Error: sqlite3 not available — ${result.error.message}. Install SQLite CLI or use bash.`;
  }

  const out = (result.stdout ?? "").trim();
  const err = (result.stderr ?? "").trim();
  if (result.status !== 0) {
    return err ? `Error: ${err}` : `Error: query failed (exit ${result.status})`;
  }
  const max = 40_000;
  if (!out) return "(no rows)";
  return out.length > max ? out.slice(0, max) + "\n... (truncated)" : out;
}

export async function executeDatabase(
  args: { database: string; query: string },
  workdir: string,
): Promise<string> {
  const rel = args.database?.trim();
  const query = args.query?.trim();
  if (!rel) return "Error: database path is required";
  if (!query) return "Error: query is required";

  const dbPath = resolvePath(rel, workdir);
  assertWithinWorkdir(dbPath, workdir);
  if (!existsSync(dbPath)) return `Error: database not found: ${rel}`;

  return runSqlite(dbPath, query);
}
