import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareSemver, checkForUpdate, getCurrentVersion } from "../../src/version/check.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("compareSemver", () => {
  it.each([
    ["1.0.0", "1.0.1", -1],
    ["2.0.0", "1.9.9", 1],
    ["1.2.3", "1.2.3", 0],
  ])("compareSemver(%s, %s) = %s", (a, b, expected) => {
    expect(Math.sign(compareSemver(a, b))).toBe(expected);
  });
});

describe("getCurrentVersion", () => {
  it("reads package version", () => {
    expect(getCurrentVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("checkForUpdate", () => {
  const cachePath = () => join(process.env.AGENT_DEV_DIR!, "update-check.json");

  beforeEach(() => {
    if (existsSync(cachePath())) unlinkSync(cachePath());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns update info when newer version exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ "dist-tags": { latest: "99.0.0" } }),
      }),
    );

    const info = await checkForUpdate();
    expect(info).not.toBeNull();
    expect(info!.latest).toBe("99.0.0");
    expect(compareSemver(info!.current, info!.latest)).toBeLessThan(0);
  });

  it("uses cache within interval", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(process.env.AGENT_DEV_DIR!, { recursive: true });
    writeFileSync(
      cachePath(),
      JSON.stringify({ checkedAt: Date.now(), latest: "99.0.0" }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await checkForUpdate();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-fetches when cache says up to date but npm has a newer release", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { getCurrentVersion } = await import("../../src/version/check.js");
    mkdirSync(process.env.AGENT_DEV_DIR!, { recursive: true });
    writeFileSync(
      cachePath(),
      JSON.stringify({ checkedAt: Date.now(), latest: getCurrentVersion() }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ "dist-tags": { latest: "99.0.0" } }),
      }),
    );

    const info = await checkForUpdate();
    expect(info).not.toBeNull();
    expect(info!.latest).toBe("99.0.0");
    expect(compareSemver(info!.current, info!.latest)).toBeLessThan(0);
  });
});
