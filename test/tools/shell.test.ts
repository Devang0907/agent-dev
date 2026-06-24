import { describe, expect, it } from "vitest";
import {
  extractUrl,
  getCommandTimeout,
  isDevServerCommand,
} from "../../src/agent/tools/shell.js";

describe("shell helpers", () => {
  it.each([
    "npm run dev",
    "next dev",
    "pnpm dev",
    "yarn dev",
    "npm start",
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

  it("stopBackgroundProcesses clears tracked processes", async () => {
    const { stopBackgroundProcesses, getBackgroundProcessCount } = await import(
      "../../src/agent/tools/shell.js"
    );
    expect(getBackgroundProcessCount()).toBe(0);
    expect(stopBackgroundProcesses()).toEqual([]);
    expect(getBackgroundProcessCount()).toBe(0);
  });
});
