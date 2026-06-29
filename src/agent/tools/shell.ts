import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { platform as osPlatform } from "node:os";
import { resolve } from "node:path";
import { getShellConfig, normalizeCommand, type ShellConfig } from "../platform.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;
const DEV_SERVER_BOOT_MS = 20_000;
const PORT_POLL_INTERVAL_MS = 300;

const DEV_SERVER_RE =
  /\b(npm run (dev|start|serve)|npm start|yarn dev|pnpm dev|next dev|nuxt dev|vite(\s|$)|react-scripts start|uvicorn|flask run|deno run.*serve|bun (run )?dev)\b/i;

const INSTALL_RE =
  /\b(npm install|npm ci|yarn install|pnpm install|npx create-|npm audit)\b/i;

const READY_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1):\d+|localhost:\d+|Local:\s*https?:\/\/[^\s]+|ready in \d|started server on|compiled successfully/i;

interface UnixBackgroundProcess {
  kind: "unix";
  child: ChildProcess;
}

interface WindowsBackgroundProcess {
  kind: "windows";
  port: number;
  command: string;
  cwd: string;
}

type BackgroundProcess = UnixBackgroundProcess | WindowsBackgroundProcess;

const backgroundProcesses = new Map<number, BackgroundProcess>();

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

function parseCommandCwd(
  command: string,
  workdir: string,
): { cwd: string; command: string } {
  const cdMatch = command.match(/^cd\s+([^\s;&]+)\s*[;&]\s*(.+)$/is);
  if (cdMatch) {
    const dir = cdMatch[1]!.replace(/^["']|["']$/g, "");
    return { cwd: resolve(workdir, dir), command: cdMatch[2]!.trim() };
  }

  const setLocation = command.match(/^Set-Location\s+([^\s;]+)\s*;\s*(.+)$/is);
  if (setLocation) {
    const dir = setLocation[1]!.replace(/^["']|["']$/g, "");
    return { cwd: resolve(workdir, dir), command: setLocation[2]!.trim() };
  }

  return { cwd: workdir, command };
}

export function guessDevServerPort(command: string): number {
  const portFlag = command.match(/(?:--port|-p)\s+(\d+)/i);
  if (portFlag) return Number.parseInt(portFlag[1]!, 10);
  if (/\bPORT=(\d+)/i.test(command)) {
    const envPort = command.match(/\bPORT=(\d+)/i);
    if (envPort) return Number.parseInt(envPort[1]!, 10);
  }
  if (/\bvite\b/i.test(command)) return 5173;
  if (/\b(uvicorn|flask)\b/i.test(command)) return 8000;
  return 3000;
}

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(
  port: number,
  timeoutMs = DEV_SERVER_BOOT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, PORT_POLL_INTERVAL_MS));
  }
  return false;
}

function drainStream(stream: NodeJS.ReadableStream | null | undefined): void {
  stream?.on("data", () => {});
}

function tokenizeWindowsCommand(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) return [];
  const match = trimmed.match(/^npm\s+run\s+(\S+)(?:\s+(.*))?$/i);
  if (match) {
    const args = ["npm", "run", match[1]!];
    if (match[2]?.trim()) args.push(...match[2].trim().split(/\s+/));
    return args;
  }
  return trimmed.split(/\s+/);
}

async function runDevServerInBackgroundWindows(
  command: string,
  workdir: string,
): Promise<string> {
  const { cwd, command: cmd } = parseCommandCwd(command, workdir);
  const port = guessDevServerPort(cmd);
  const args = ["/c", "start", "/B", ...tokenizeWindowsCommand(cmd)];

  const child = spawn("cmd.exe", args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
  });

  if (!child.pid) {
    return "Error: failed to start dev server process";
  }

  const pid = child.pid;
  backgroundProcesses.set(pid, { kind: "windows", port, command: cmd, cwd });
  child.unref();

  const ready = await waitForPort(port);
  const url = `http://localhost:${port}`;
  if (ready) {
    return `Dev server started in background (port ${port}).\nOpen ${url}\nStop: close the terminal or kill the process on port ${port}`;
  }
  return `Dev server starting in background.\nLikely URL: ${url}\nStop: close the terminal or kill the process on port ${port}`;
}

async function runDevServerInBackgroundUnix(
  command: string,
  workdir: string,
  shell: ShellConfig,
): Promise<string> {
  const normalized = normalizeCommand(command, shell);
  const { cwd, command: cmd } = parseCommandCwd(normalized, workdir);
  const args = [...shell.args, cmd];

  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const finish = (message: string) => {
      if (settled) return;
      settled = true;
      resolve(message);
    };

    const child = spawn(shell.executable, args, {
      cwd,
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
    backgroundProcesses.set(pid, { kind: "unix", child });
    child.on("exit", () => {
      backgroundProcesses.delete(pid);
    });

    const onReady = () => {
      clearTimeout(bootTimer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      drainStream(child.stdout);
      drainStream(child.stderr);
      child.unref();
      const url = extractUrl(output);
      finish(
        `Dev server started in background (PID ${pid}).\nOpen ${url}\n${killHint(pid)}`,
      );
    };

    const onData = (chunk: Buffer | string) => {
      output += String(chunk);
      if (READY_RE.test(output)) {
        onReady();
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
      drainStream(child.stdout);
      drainStream(child.stderr);
      child.unref();
      const url = extractUrl(output);
      finish(
        `Dev server starting in background (PID ${pid}).\nLikely URL: ${url}\n${killHint(pid)}`,
      );
    }, DEV_SERVER_BOOT_MS);
  });
}

async function runDevServerInBackground(
  command: string,
  workdir: string,
  shell: ShellConfig,
): Promise<string> {
  if (osPlatform() === "win32") {
    return runDevServerInBackgroundWindows(command, workdir);
  }
  return runDevServerInBackgroundUnix(command, workdir, shell);
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

function killWindowsPort(port: number): void {
  const result = spawnSync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true });
  const pids = new Set<number>();
  for (const line of result.stdout.split("\n")) {
    if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number.parseInt(parts[parts.length - 1] ?? "", 10);
    if (Number.isFinite(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { windowsHide: true });
  }
}

export function stopBackgroundProcesses(): number[] {
  const stopped: number[] = [];
  for (const [pid, tracked] of backgroundProcesses) {
    try {
      if (tracked.kind === "windows") {
        killWindowsPort(tracked.port);
        stopped.push(tracked.port);
      } else if (osPlatform() === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { windowsHide: true });
        stopped.push(pid);
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* process may already be gone */
        }
        try {
          tracked.child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        stopped.push(pid);
      }
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
