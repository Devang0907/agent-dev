import { describe, expect, it } from "vitest";
import {
  completeSlashInput,
  isModelCommand,
  matchSlashCommands,
  matchSkillSuggestions,
} from "../../src/ui/slash-commands.js";

describe("matchSlashCommands", () => {
  it("matches prefix", () => {
    const matches = matchSlashCommands("/tas");
    expect(matches.some((m) => m.cmd === "/tasks")).toBe(true);
  });

  it("matches /compact", () => {
    expect(matchSlashCommands("/compact").some((m) => m.cmd === "/compact")).toBe(true);
  });

  it("matches /voice", () => {
    expect(matchSlashCommands("/voice").some((m) => m.cmd === "/voice")).toBe(true);
  });

  it("matches /m alias", () => {
    expect(matchSlashCommands("/m").some((m) => m.cmd === "/model")).toBe(true);
  });
});

describe("isModelCommand", () => {
  it.each(["/model", "/m", "/model groq"])("detects %s", (cmd) => {
    expect(isModelCommand(cmd)).toBe(true);
  });
});

describe("completeSlashInput", () => {
  it("completes unique match", () => {
    expect(completeSlashInput("/qui")).toBe("/quit");
  });
});

describe("matchSkillSuggestions", () => {
  it("lists skills on /skill", () => {
    const items = matchSkillSuggestions("/skill", [
      { name: "browser-automation", description: "Browse the web" },
    ]);
    expect(items?.[0]?.cmd).toBe("/skill browser-automation");
  });
});
