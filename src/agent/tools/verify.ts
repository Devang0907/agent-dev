import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { executeShellCommand } from "./shell.js";

export const verifyTool: ToolDefinition = {
  name: "verify",
  description:
    "Run tests or build to verify changes. Auto-detects npm test from package.json if no command given. Returns pass/fail summary.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: 'Test command (default: npm test, or scripts.test from package.json)',
      },
      type: {
        type: "string",
        description: "test | build | typecheck — shorthand to pick common scripts",
      },
    },
    additionalProperties: false,
  },
};

const SCRIPT_MAP: Record<string, string[]> = {
  test: ["test", "test:unit", "test:ci"],
  build: ["build", "compile"],
  typecheck: ["typecheck", "check", "lint"],
};

export function resolveVerifyCommand(
  args: { command?: string; type?: string },
  workdir: string,
): string | null {
  return (
    args.command?.trim() ||
    detectCommand(workdir, args.type?.trim().toLowerCase()) ||
    null
  );
}

function detectCommand(workdir: string, type?: string): string | null {
  const pkgPath = join(workdir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      const keys = type && SCRIPT_MAP[type] ? SCRIPT_MAP[type] : SCRIPT_MAP.test;
      for (const key of keys) {
        if (scripts[key]) return `npm run ${key}`;
      }
    } catch {
      /* ignore */
    }
  }

  if (type === "build") return existsSync(join(workdir, "package.json")) ? "npm run build" : null;
  if (type === "typecheck") return existsSync(join(workdir, "tsconfig.json")) ? "npx tsc --noEmit" : null;
  return existsSync(join(workdir, "package.json")) ? "npm test" : null;
}

function summarizeResult(command: string, output: string): string {
  const lower = output.toLowerCase();
  const failed =
    output.startsWith("Error:") ||
    /\(exit [1-9]\d*\)/.test(output) ||
    /\b(fail|failed|failure|error)\b/.test(lower) && !/\b0 failed\b/.test(lower);

  const passed = !failed && (/\b(pass|passed|ok|success)\b/i.test(output) || /\(exit 0\)/.test(output));

  const lines = [`Command: ${command}`, ""];
  if (passed) lines.push("Result: PASSED");
  else if (failed) lines.push("Result: FAILED");
  else lines.push("Result: COMPLETED (check output)");

  lines.push("", "--- output ---", output);
  return lines.join("\n");
}

export async function executeVerify(
  args: { command?: string; type?: string },
  workdir: string,
): Promise<string> {
  const command = resolveVerifyCommand(args, workdir);

  if (!command) {
    return "Error: no test command found. Provide command or add scripts.test to package.json.";
  }

  const output = await executeShellCommand(command, workdir);
  return summarizeResult(command, output);
}
