import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { resolvePath, assertWithinWorkdir } from "./paths.js";

export const grepTool: ToolDefinition = {
  name: "grep",
  description:
    "Search the codebase. Uses ripgrep (rg) when available; on Windows falls back to findstr, then PowerShell.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex or literal search pattern" },
      path: { type: "string", description: "File or directory to search (default: project root)" },
      glob: { type: "string", description: 'File filter, e.g. "*.ts" or "*.{ts,tsx}"' },
      case_insensitive: { type: "boolean", description: "Case-insensitive search" },
      context: { type: "number", description: "Lines of context (ripgrep/grep only; max 5)" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
};

const MAX_MATCHES = 200;

function truncateOutput(text: string, max = 40_000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n... (truncated)";
}

function limitLines(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= MAX_MATCHES) return lines.join("\n");
  return lines.slice(0, MAX_MATCHES).join("\n") + `\n... (${lines.length - MAX_MATCHES} more matches)`;
}

async function runCommand(
  executable: string,
  args: string[],
  workdir: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(executable, args, { cwd: workdir, windowsHide: true });
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function detectRipgrep(): boolean {
  const r = spawnSync("rg", ["--version"], { stdio: "ignore", windowsHide: true });
  return r.status === 0;
}

function buildRipgrepArgs(
  pattern: string,
  searchPath: string,
  glob?: string,
  caseInsensitive?: boolean,
  context?: number,
): string[] {
  const args = ["--line-number", "--no-heading", "--color=never", `--max-count=${MAX_MATCHES}`];
  if (caseInsensitive) args.push("-i");
  if (glob) args.push("--glob", glob);
  if (context && context > 0) args.push("-C", String(Math.min(5, context)));
  args.push(pattern, searchPath);
  return args;
}

function buildGrepArgs(
  pattern: string,
  searchPath: string,
  caseInsensitive?: boolean,
  context?: number,
): string[] {
  const args = ["-r", "-n", "-H", "-E"];
  if (caseInsensitive) args.push("-i");
  if (context && context > 0) args.push("-C", String(Math.min(5, context)));
  args.push(pattern, searchPath);
  return args;
}

function globToFindstrPatterns(searchPath: string, isFile: boolean, glob?: string): string[] {
  if (isFile) return [searchPath];

  if (!glob) return [join(searchPath, "*.*")];

  const brace = glob.match(/^\*\.?\{([^}]+)\}$/);
  if (brace) {
    return brace[1]!.split(",").map((ext) => join(searchPath, `*.${ext.trim()}`));
  }

  if (glob.startsWith("*.")) {
    return [join(searchPath, glob)];
  }

  return [join(searchPath, glob)];
}

function buildFindstrArgs(
  pattern: string,
  filePattern: string,
  recursive: boolean,
  caseInsensitive?: boolean,
): string[] {
  const args: string[] = [];
  if (recursive) args.push("/S");
  args.push("/N");
  if (caseInsensitive) args.push("/I");

  const useRegex = /[.^$+?[\]{}()|\\]/.test(pattern);
  if (useRegex) {
    args.push("/R", pattern);
  } else {
    args.push(`/C:${pattern}`);
  }

  args.push(filePattern);
  return args;
}

function runFindstr(
  pattern: string,
  searchPath: string,
  workdir: string,
  options: { glob?: string; case_insensitive?: boolean },
): string {
  const isFile = statSync(searchPath).isFile();
  const filePatterns = globToFindstrPatterns(searchPath, isFile, options.glob);
  const chunks: string[] = [];

  for (const filePattern of filePatterns) {
    const args = buildFindstrArgs(pattern, filePattern, !isFile, options.case_insensitive);
    const result = spawnSync("findstr", args, {
      cwd: workdir,
      encoding: "utf-8",
      maxBuffer: 4_000_000,
      windowsHide: true,
    });

    const stdout = (result.stdout ?? "").trim();
    if (stdout) chunks.push(stdout);

    const total = chunks.join("\n").split(/\r?\n/).filter(Boolean).length;
    if (total >= MAX_MATCHES) break;
  }

  const out = limitLines(chunks.join("\n"));
  return truncateOutput(out);
}

function runPowerShellGrep(
  pattern: string,
  searchPath: string,
  workdir: string,
  options: { glob?: string; case_insensitive?: boolean },
): string {
  const isFile = statSync(searchPath).isFile();
  const psPattern = options.case_insensitive ? `(?i)${pattern}` : pattern;
  const escapedPath = searchPath.replace(/'/g, "''");
  const escapedPattern = psPattern.replace(/'/g, "''");

  let filter = "";
  if (!isFile && options.glob) {
    const g = options.glob.replace(/^\*\./, "");
    if (g.includes("{")) {
      const exts = g.match(/\{([^}]+)\}/)?.[1]?.split(",").map((e) => e.trim()) ?? [];
      const extList = exts.map((e) => `'${e}'`).join(",");
      filter = ` | Where-Object { $ex = $_.Extension.TrimStart('.'); @(${extList}) -contains $ex }`;
    } else {
      filter = ` | Where-Object { $_.Extension -eq '.${g}' }`;
    }
  }

  const ps = isFile
    ? `Select-String -Path '${escapedPath}' -Pattern '${escapedPattern}' | Select-Object -First ${MAX_MATCHES} | ForEach-Object { $_.Path + ':' + $_.LineNumber + ':' + $_.Line }`
    : `Get-ChildItem -Path '${escapedPath}' -Recurse -File${filter} | Select-String -Pattern '${escapedPattern}' | Select-Object -First ${MAX_MATCHES} | ForEach-Object { $_.Path + ':' + $_.LineNumber + ':' + $_.Line }`;

  const shell = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    cwd: workdir,
    encoding: "utf-8",
    maxBuffer: 4_000_000,
    windowsHide: true,
  });

  const out = truncateOutput(limitLines((shell.stdout ?? "").trim()));
  return out;
}

export async function executeGrep(
  args: {
    pattern: string;
    path?: string;
    glob?: string;
    case_insensitive?: boolean;
    context?: number;
  },
  workdir: string,
): Promise<string> {
  const pattern = args.pattern?.trim();
  if (!pattern) return "Error: pattern is required";

  const rel = args.path ?? ".";
  const searchPath = resolvePath(rel, workdir);
  assertWithinWorkdir(searchPath, workdir);
  if (!existsSync(searchPath)) return `Error: path not found: ${rel}`;

  if (detectRipgrep()) {
    const { stdout, stderr } = await runCommand(
      "rg",
      buildRipgrepArgs(pattern, searchPath, args.glob, args.case_insensitive, args.context),
      workdir,
    );
    const out = truncateOutput((stdout + (stderr ? `\n${stderr}` : "")).trim());
    return out || "No matches found.";
  }

  if (platform() === "win32") {
    try {
      const findstrOut = runFindstr(pattern, searchPath, workdir, {
        glob: args.glob,
        case_insensitive: args.case_insensitive,
      });
      if (findstrOut) return findstrOut;
    } catch {
      /* fall through to PowerShell */
    }

    try {
      const psOut = runPowerShellGrep(pattern, searchPath, workdir, {
        glob: args.glob,
        case_insensitive: args.case_insensitive,
      });
      return psOut || "No matches found.";
    } catch (err) {
      return `Error: search failed — ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const { stdout, stderr } = await runCommand(
    "grep",
    buildGrepArgs(pattern, searchPath, args.case_insensitive, args.context),
    workdir,
  );
  const out = truncateOutput((stdout + (stderr ? `\n${stderr}` : "")).trim());
  return out || "No matches found.";
}
