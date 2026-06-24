import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { platform as osPlatform } from "node:os";
import { getShellConfig, normalizeCommand, type ShellConfig } from "../platform.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;
const DEV_SERVER_BOOT_MS = 20_000;

const DEV_SERVER_RE =
  /\b(npm run dev|npm start|yarn dev|pnpm dev|next dev|nuxt dev|vite(\s|$)|react-scripts start)\b/i;

const INSTALL_RE =
  /\b(npm install|npm ci|yarn install|pnpm install|npx create-|npm audit)\b/i;

const READY_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1):\d+|localhost:\d+|Local:\s*https?:\/\/[^\s]+|ready in \d|started server on|compiled successfully/i;

const backgroundProcesses = new Map<number, ChildProcess>();

export function getCommandTimeout(command: string): number {
  return INSTALL_RE.test(command) ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export function isDevServerCommand(command: string): boolean {
  return DEV_SERVER_RE.test(command) || /\brun dev\b/i.test(command);
}

export function extractUrl(output: string): string {
  const http = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i);
  if (http) return http[0]!;
  const local = output.match(/localhost:\d+/i);
  if (local) return `http://${local[0]!}`;
  return "http://localhost:3000";
}

function killHint(pid: number): string {
  return osPlatform() === "win32"
    ? `Stop: taskkill /PID ${pid} /F`
    : `Stop: kill ${pid}`;
}

async function runDevServerInBackground(
  command: string,
  workdir: string,
  shell: ShellConfig,
): Promise<string> {
  const normalized = normalizeCommand(command, shell);
  const args = [...shell.args, normalized];

  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const finish = (message: string) => {
      if (settled) return;
      settled = true;
      resolve(message);
    };

    const child = spawn(shell.executable, args, {
      cwd: workdir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
      windowsHide: true,
    });

    if (!child.pid) {
      finish("Error: failed to start dev server process");
      return;
    }

    const pid = child.pid;
    backgroundProcesses.set(pid, child);
    child.on("exit", () => {
      backgroundProcesses.delete(pid);
    });

    const onData = (chunk: Buffer | string) => {
      output += String(chunk);
      if (READY_RE.test(output)) {
        clearTimeout(bootTimer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        child.unref();
        const url = extractUrl(output);
        finish(
          `Dev server started in background (PID ${pid}).\nOpen ${url}\n${killHint(pid)}`,
        );
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err) => {
      backgroundProcesses.delete(pid);
      finish(`Error: ${err.message}`);
    });

    const bootTimer = setTimeout(() => {
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.unref();
      const url = extractUrl(output);
      finish(
        `Dev server starting in background (PID ${pid}).\nLikely URL: ${url}\n${killHint(pid)}`,
      );
    }, DEV_SERVER_BOOT_MS);
  });
}

export async function executeShellCommand(
  command: string,
  workdir: string,
): Promise<string> {
  const shell = getShellConfig();
  const normalized = normalizeCommand(command, shell);

  if (isDevServerCommand(normalized)) {
    return runDevServerInBackground(normalized, workdir, shell);
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
        `Error: command timed out after ${timeoutMs / 1000}s\n${combineOutput(stdout, stderr)}`.trim(),
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

export function stopBackgroundProcesses(): number[] {
  const stopped: number[] = [];
  for (const [pid, child] of backgroundProcesses) {
    try {
      if (osPlatform() === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { windowsHide: true });
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* process may already be gone */
        }
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
      stopped.push(pid);
    } catch {
      /* ignore kill failures */
    }
    backgroundProcesses.delete(pid);
  }
  return stopped;
}

export function getBackgroundProcessCount(): number {
  return backgroundProcesses.size;
}
