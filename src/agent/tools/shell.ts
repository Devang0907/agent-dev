import { spawn } from "node:child_process";
import { getShellConfig, normalizeCommand } from "../platform.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;

const DEV_SERVER_RE =
  /\b(npm run dev|npm start|yarn dev|pnpm dev|next dev|nuxt dev|vite(\s|$)|react-scripts start|node .*--watch)\b/i;

const INSTALL_RE =
  /\b(npm install|npm ci|yarn install|pnpm install|npx create-|npm audit)\b/i;

function getCommandTimeout(command: string): number {
  return INSTALL_RE.test(command) ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

function isDevServerCommand(command: string): boolean {
  return DEV_SERVER_RE.test(command) || /\brun dev\b/i.test(command);
}

export async function executeShellCommand(
  command: string,
  workdir: string,
): Promise<string> {
  const shell = getShellConfig();
  const normalized = normalizeCommand(command, shell);

  if (isDevServerCommand(normalized)) {
    return [
      "Error: dev servers run until stopped and cannot run inside the agent.",
      `Suggested: open a separate terminal, cd to the project, then run: ${normalized.trim()}`,
      "To verify the project here, use a one-shot command like: npm run build",
    ].join("\n");
  }

  const timeoutMs = getCommandTimeout(normalized);
  const args = [...shell.args, normalized];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(shell.executable, args, {
      cwd: workdir,
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        npm_config_yes: "true",
      },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve(
        `Error: command timed out after ${timeoutMs / 1000}s\n${combineOutput(stdout, stderr)}\nTip: dev servers (npm run dev) cannot run here — use npm run build to verify, or run the dev server in your own terminal.`.trim(),
      );
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(`Error: ${err.message}`);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = combineOutput(stdout, stderr);
      if (code === 0) return resolve(out.trim() || "(no output)");
      resolve(out.trim() ? `${out.trim()}\n(exit ${code})` : `Error: command failed (exit ${code})`);
    });
  });
}

function combineOutput(stdout: string, stderr: string): string {
  return stdout + (stderr ? (stdout ? `\n${stderr}` : stderr) : "");
}
