import { spawnSync } from "node:child_process";
import {
  discoverSkills,
  formatSkillsListMessage,
  SKILLS_BROWSE_HINT,
  SKILLS_CATALOG_URL,
} from "../agent/skills.js";
import { loadSettings } from "../config/settings.js";

/** Vercel skills CLI agent id — installs to .agents/skills and ~/.config/agents/skills */
export const SKILLS_CLI_AGENT = "universal";

export interface SkillsCliOptions {
  global?: boolean;
  skill?: string;
}

function runSkillsCli(args: string[]): number {
  const result = spawnSync("npx", ["--yes", "skills", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

export async function runSkillsAdd(
  source: string,
  options: SkillsCliOptions = {},
): Promise<number> {
  const args = ["add", source, "--agent", SKILLS_CLI_AGENT];
  if (options.global) args.push("-g");
  if (options.skill) args.push("--skill", options.skill);
  return runSkillsCli(args);
}

export async function runSkillsList(global = false): Promise<number> {
  const args = ["list", "--agent", SKILLS_CLI_AGENT];
  if (global) args.push("-g");
  return runSkillsCli(args);
}

export async function runSkillsFind(query?: string): Promise<number> {
  const args = query ? ["find", query] : ["find"];
  return runSkillsCli(args);
}

export async function runSkillsRemove(names: string[], global = false): Promise<number> {
  const args = ["remove", ...names, "--agent", SKILLS_CLI_AGENT];
  if (global) args.push("-g");
  return runSkillsCli(args);
}

export async function runSkillsInit(name: string, global = false): Promise<number> {
  const args = ["init", name, "--agent", SKILLS_CLI_AGENT];
  if (global) args.push("-g");
  return runSkillsCli(args);
}

export function openSkillsCatalog(): void {
  const cmd =
    process.platform === "win32"
      ? "start"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  spawnSync(cmd, [SKILLS_CATALOG_URL], { shell: process.platform === "win32", stdio: "ignore" });
}

export function printSkillsHelp(): void {
  console.log(`
agent skills — manage skills via the Vercel skills CLI

Usage:
  agent skills list [-g]              List installed skills
  agent skills add <source> [-g]      Install skills from a repo or URL
  agent skills add <source> --skill <name>
  agent skills find [query]           Search skills.sh
  agent skills init <name> [-g]       Scaffold a new skill
  agent skills remove <name>... [-g]  Remove installed skills

Browse skills:
  ${SKILLS_CATALOG_URL}
  ${SKILLS_BROWSE_HINT.split("\n")[1]}

Install examples:
  agent skills add vercel-labs/agent-skills
  agent skills add vercel-labs/agent-skills -g
  agent skills add vercel-labs/agent-skills --skill web-design-guidelines

Skills are discovered from:
  .agents/skills/              (project, walk up to git root)
  ~/.config/agents/skills/     (global, Vercel CLI default)
  ~/.agents/skills/            (global compat)
  ~/.agent-dev/skills/         (global agent-dev)
  skills.paths in settings.json
`);
}

export async function runSkillsCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;

  if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
    printSkillsHelp();
    return 0;
  }

  if (sub === "list" || sub === "ls") {
    const global = rest.includes("-g") || rest.includes("--global");
    if (rest.includes("--json")) {
      const settings = loadSettings();
      const skills = discoverSkills(process.cwd(), settings);
      console.log(JSON.stringify(skills, null, 2));
      return 0;
    }
    if (rest.includes("--native")) {
      console.log(formatSkillsListMessage(process.cwd(), loadSettings()));
      return 0;
    }
    return runSkillsList(global);
  }

  if (sub === "add") {
    const global = rest.includes("-g") || rest.includes("--global");
    const skillIdx = rest.findIndex((a) => a === "--skill");
    const skill = skillIdx >= 0 ? rest[skillIdx + 1] : undefined;
    const source = rest.find((a) => !a.startsWith("-") && a !== skill);
    if (!source) {
      console.error("Usage: agent skills add <source> [-g] [--skill <name>]");
      return 1;
    }
    return runSkillsAdd(source, { global, skill });
  }

  if (sub === "find") {
    const query = rest.find((a) => !a.startsWith("-"));
    return runSkillsFind(query);
  }

  if (sub === "init") {
    const global = rest.includes("-g") || rest.includes("--global");
    const name = rest.find((a) => !a.startsWith("-"));
    if (!name) {
      console.error("Usage: agent skills init <name> [-g]");
      return 1;
    }
    return runSkillsInit(name, global);
  }

  if (sub === "remove" || sub === "rm") {
    const global = rest.includes("-g") || rest.includes("--global");
    const names = rest.filter((a) => !a.startsWith("-"));
    if (names.length === 0) {
      console.error("Usage: agent skills remove <name>... [-g]");
      return 1;
    }
    return runSkillsRemove(names, global);
  }

  console.error(`Unknown skills command: ${sub}`);
  printSkillsHelp();
  return 1;
}
