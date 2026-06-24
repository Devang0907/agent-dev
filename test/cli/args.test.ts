import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args.js";

describe("parseArgs", () => {
  it("parses print flag", () => {
    expect(parseArgs(["node", "agent", "-p", "hello"]).print).toBe(true);
  });

  it("parses continue flag", () => {
    expect(parseArgs(["node", "agent", "-c"]).continueSession).toBe(true);
  });

  it("parses boss flag", () => {
    expect(parseArgs(["node", "agent", "--boss"]).boss).toBe(true);
  });

  it("parses model flag", () => {
    const args = parseArgs(["node", "agent", "--model", "groq/llama-3.3-70b-versatile", "hi"]);
    expect(args.model).toBe("groq/llama-3.3-70b-versatile");
    expect(args.prompt).toBe("hi");
  });

  it("parses help", () => {
    expect(parseArgs(["node", "agent", "-h"]).help).toBe(true);
  });

  it("collects positional prompt", () => {
    expect(parseArgs(["node", "agent", "list", "files"]).prompt).toBe("list files");
  });
});
