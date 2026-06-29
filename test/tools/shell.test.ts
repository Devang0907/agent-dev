import { describe, expect, it } from "vitest";
import {
  extractUrl,
  getCommandTimeout,
  guessDevServerPort,
  isDevServerCommand,
} from "../../src/agent/tools/shell.js";

describe("shell helpers", () => {
  it.each([
    "npm run dev",
    "next dev",
    "pnpm dev",
    "yarn dev",
    "npm start",
    "npm run serve",
    "uvicorn main:app",
    "flask run",
  ])("detects dev server: %s", (cmd) => {
    expect(isDevServerCommand(cmd)).toBe(true);
  });

  it("does not flag plain test command", () => {
    expect(isDevServerCommand("npm test")).toBe(false);
  });

  it("extracts localhost URL", () => {
    expect(extractUrl("ready on http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("defaults url when missing", () => {
    expect(extractUrl("starting...")).toBe("http://localhost:3000");
  });

  it("uses longer timeout for install", () => {
    expect(getCommandTimeout("npm install")).toBeGreaterThan(getCommandTimeout("echo hi"));
  });

  it("guesses common dev server ports", () => {
    expect(guessDevServerPort("npm run dev")).toBe(3000);
    expect(guessDevServerPort("vite")).toBe(5173);
    expect(guessDevServerPort("uvicorn main:app --port 9001")).toBe(9001);
    expect(guessDevServerPort("flask run")).toBe(8000);
  });

  it("stopBackgroundProcesses clears tracked processes", async () => {
    const { stopBackgroundProcesses, getBackgroundProcessCount } = await import(
      "../../src/agent/tools/shell.js"
    );
    expect(getBackgroundProcessCount()).toBe(0);
    expect(stopBackgroundProcesses()).toEqual([]);
    expect(getBackgroundProcessCount()).toBe(0);
  });

  if (process.platform === "win32") {
    it("starts npm run dev in background on Windows", async () => {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { createConnection } = await import("node:net");
      const { executeShellCommand, stopBackgroundProcesses } = await import(
        "../../src/agent/tools/shell.js"
      );

      const dir = join(process.env.AGENT_DEV_DIR!, "mini-dev");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "mini-dev",
          scripts: {
            dev: "node -e \"require('http').createServer((q,r)=>r.end('ok')).listen(3000,()=>console.log('ready on http://localhost:3000'))\"",
          },
        }),
      );

      const result = await executeShellCommand("npm run dev", dir);
      expect(result).toMatch(/Dev server started in background|Dev server starting in background/);
      expect(result).toMatch(/localhost:3000/);

      const open = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ port: 3000, host: "127.0.0.1" }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
        socket.setTimeout(1000, () => {
          socket.destroy();
          resolve(false);
        });
      });
      expect(open).toBe(true);

      stopBackgroundProcesses();
    }, 30_000);
  }
});
