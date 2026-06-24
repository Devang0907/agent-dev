import { describe, expect, it, vi, beforeEach } from "vitest";

const platformMock = vi.hoisted(() => vi.fn(() => "linux"));

vi.mock("node:os", () => ({
  platform: () => platformMock(),
  arch: () => "x64",
  release: () => "10.0",
  homedir: () => "/home/test",
}));

import { normalizeCommand, getShellConfig } from "../../src/agent/platform.js";

describe("normalizeCommand", () => {
  beforeEach(() => {
    platformMock.mockReturnValue("linux");
  });

  it("maps mkdir -p on Windows PowerShell 5", () => {
    platformMock.mockReturnValue("win32");
    const shell = { executable: "powershell.exe", args: [], name: "Windows PowerShell", supportsAndAnd: false };
    expect(normalizeCommand("mkdir -p foo", shell)).toContain("New-Item");
  });

  it("replaces && with ; when shell lacks && support", () => {
    platformMock.mockReturnValue("win32");
    const shell = { executable: "powershell.exe", args: [], name: "Windows PowerShell", supportsAndAnd: false };
    expect(normalizeCommand("cd foo && npm test", shell)).toBe("cd foo; npm test");
  });

  it("leaves bash commands on unix", () => {
    const shell = getShellConfig();
    expect(normalizeCommand("mkdir -p foo", shell)).toBe("mkdir -p foo");
  });
});

describe("getShellConfig", () => {
  beforeEach(() => {
    platformMock.mockReturnValue("linux");
  });

  it("returns bash on linux", () => {
    expect(getShellConfig().name).toBe("bash");
  });
});
