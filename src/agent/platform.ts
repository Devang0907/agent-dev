import { existsSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { join } from "node:path";

export interface ShellConfig {
  executable: string;
  args: string[];
  name: string;
  supportsAndAnd: boolean;
}

function findPwsh(): string | undefined {
  const candidates = [
    process.env.PWSH_PATH,
    join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "", "PowerShell", "7", "pwsh.exe"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function getShellConfig(): ShellConfig {
  if (platform() === "win32") {
    const pwsh = findPwsh();
    if (pwsh) {
      return {
        executable: pwsh,
        name: "PowerShell 7+ (pwsh)",
        supportsAndAnd: true,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"],
      };
    }
    return {
      executable: "powershell.exe",
      name: "Windows PowerShell",
      supportsAndAnd: false,
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"],
    };
  }

  return {
    executable: process.env.SHELL ?? "/bin/bash",
    name: "bash",
    supportsAndAnd: true,
    args: ["-lc"],
  };
}

/** Adapt common Unix-isms and command chaining for the host shell. */
export function normalizeCommand(command: string, shell: ShellConfig): string {
  let cmd = command.trim();
  if (!cmd) return cmd;

  if (platform() === "win32") {
    if (!shell.supportsAndAnd) {
      cmd = cmd.replace(/\s&&\s/g, "; ");
    }
    cmd = cmd
      .replace(/\bmkdir -p\s+/g, "New-Item -ItemType Directory -Force -Path ")
      .replace(/\brm -rf\s+/g, "Remove-Item -Recurse -Force ")
      .replace(/\brm -r\s+/g, "Remove-Item -Recurse -Force ")
      .replace(/\btouch\s+/g, "New-Item -ItemType File -Force ");
  }

  return cmd;
}

export function getPlatformContext(): string {
  const shell = getShellConfig();
  const lines = [
    `Platform: ${platform()} ${arch()} (${release()})`,
    `Shell: ${shell.name}`,
    `Working directory: ${process.cwd()}`,
    "This agent runs on the user's real local machine — not in a sandbox or cloud VM. Shell commands execute locally.",
  ];

  if (platform() === "win32") {
    lines.push(
      "This agent runs on Windows. Use PowerShell-compatible commands.",
      shell.supportsAndAnd
        ? "You may chain commands with ; or &&."
        : "Chain commands with ; (&& is NOT supported in Windows PowerShell 5).",
      "Examples: New-Item -ItemType Directory -Force todo-app; Set-Location todo-app",
      "For npx/npm scaffolding, always use non-interactive flags (--yes, -y, --defaults) and set CI=1.",
      "Do not use mkdir -p, rm -rf, or touch — use PowerShell equivalents or the write tool.",
      "Use the grep tool for codebase search (findstr on Windows when ripgrep is not installed).",
      "Dev servers (npm run dev, next dev) start in the background via bash and return a localhost URL for the user to open.",
      "When asked to run or preview a web app, always use bash to start the dev server — never refuse or tell the user to run it themselves.",
      "Do not run npm audit fix unless the user explicitly asks.",
    );
  } else {
    lines.push(
      "Use bash/sh syntax. Chain commands with && or ;.",
      "For npx/npm scaffolding, use non-interactive flags (--yes, -y) to avoid prompts.",
      "Dev servers (npm run dev, next dev) start in the background via bash and return a localhost URL for the user to open.",
      "When asked to run or preview a web app, always use bash to start the dev server — never refuse or tell the user to run it themselves.",
    );
  }

  return lines.join("\n");
}
