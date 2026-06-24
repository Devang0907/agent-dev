import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { getConfigDir } from "../config/paths.js";
import type { Settings } from "../config/settings.js";
import { findGitRoot, walkUpDirs } from "./workspace.js";

const AGENTS_DIR = ".agents";
const GLOBAL_AGENTS_SKILLS = join(homedir(), ".agents", "skills");
const GLOBAL_CONFIG_AGENTS_SKILLS = join(homedir(), ".config", "agents", "skills");
export const USER_SKILLS_DIR = join(getConfigDir(), "skills");

/** Browse all community + Vercel skills */
export const SKILLS_CATALOG_URL = "https://skills.sh";
/** Official Vercel skills documentation and curated list */
export const SKILLS_DOCS_URL = "https://vercel.com/docs/agent-resources/skills";

export const SKILLS_BROWSE_HINT = [
  `Browse available skills: ${SKILLS_CATALOG_URL}`,
  `Vercel curated skills: ${SKILLS_DOCS_URL}`,
  "Search in terminal: agent skills find <query>",
].join("\n");

export interface SkillInfo {
  name: string;
  description?: string;
  location: string;
  content: string;
}

export interface SkillContext {
  workdir: string;
  settings: Settings;
}

let activeSkillContext: SkillContext | null = null;

export function setSkillContext(ctx: SkillContext | null): void {
  activeSkillContext = ctx;
}

export function getSkillContext(): SkillContext {
  if (!activeSkillContext) {
    throw new Error("Skill context is not initialized");
  }
  return activeSkillContext;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractFrontmatterField(frontmatter: string, field: string): string | undefined {
  const block = frontmatter.match(
    new RegExp(`^${field}:\\s*>-?\\s*\\n((?:  .+\\r?\\n?)*)`, "m"),
  );
  if (block) return block[1]!.replace(/^  /gm, "").trim();

  const literal = frontmatter.match(new RegExp(`^${field}:\\s*\\|\\s*\\n((?:  .+\\r?\\n?)*)`, "m"));
  if (literal) return literal[1]!.replace(/^  /gm, "").trim();

  const single = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (single) return stripQuotes(single[1]!.trim());

  return undefined;
}

export function parseSkillFile(
  raw: string,
  fallbackName: string,
): { name: string; description?: string; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { name: fallbackName, content: raw.trim() };
  }

  const frontmatter = match[1]!;
  const name = extractFrontmatterField(frontmatter, "name") ?? fallbackName;
  const description = extractFrontmatterField(frontmatter, "description");
  return {
    name,
    description,
    content: (match[2] ?? "").trim(),
  };
}

function loadSkillFromPath(skillPath: string): SkillInfo | undefined {
  if (!existsSync(skillPath)) return undefined;

  const dirName = dirname(skillPath).split(/[/\\]/).pop() ?? "skill";
  let raw = "";
  try {
    raw = readFileSync(skillPath, "utf-8");
  } catch {
    return undefined;
  }

  const parsed = parseSkillFile(raw, dirName);
  if (!parsed.name) return undefined;

  return {
    name: parsed.name,
    description: parsed.description,
    location: resolve(skillPath),
    content: parsed.content,
  };
}

function collectSkillMdFiles(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];

  const found: string[] = [];

  function walk(dir: string): void {
    const skillFile = join(dir, "SKILL.md");
    if (existsSync(skillFile)) {
      found.push(resolve(skillFile));
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      walk(join(dir, entry.name));
    }
  }

  walk(skillsRoot);
  return found;
}

function expandSkillPath(item: string, workdir: string): string {
  if (item.startsWith("~/")) return join(homedir(), item.slice(2));
  if (item.startsWith("~\\")) return join(homedir(), item.slice(2));
  return resolve(workdir, item);
}

function discoverSkillPaths(workdir: string, settings: Settings): string[] {
  const paths = new Set<string>();
  const gitRoot = findGitRoot(workdir);

  for (const root of [
    GLOBAL_CONFIG_AGENTS_SKILLS,
    GLOBAL_AGENTS_SKILLS,
    USER_SKILLS_DIR,
  ]) {
    for (const match of collectSkillMdFiles(root)) {
      paths.add(match);
    }
  }

  for (const dir of walkUpDirs(workdir, gitRoot)) {
    for (const match of collectSkillMdFiles(join(dir, AGENTS_DIR, "skills"))) {
      paths.add(match);
    }
  }

  for (const item of settings.skills?.paths ?? []) {
    const dir = expandSkillPath(item, workdir);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const direct = join(dir, "SKILL.md");
    if (existsSync(direct)) {
      paths.add(resolve(direct));
      continue;
    }
    for (const match of collectSkillMdFiles(dir)) {
      paths.add(match);
    }
  }

  return [...paths];
}

export function discoverSkills(workdir: string, settings: Settings): SkillInfo[] {
  const byName = new Map<string, SkillInfo>();

  for (const skillPath of discoverSkillPaths(workdir, settings)) {
    const skill = loadSkillFromPath(skillPath);
    if (skill) byName.set(skill.name, skill);
  }

  let skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

  const enabled = settings.skills?.enabled;
  const disabled = settings.skills?.disabled;

  if (enabled && enabled.length > 0) {
    const allow = new Set(enabled);
    skills = skills.filter((skill) => allow.has(skill.name));
  } else if (disabled && disabled.length > 0) {
    const block = new Set(disabled);
    skills = skills.filter((skill) => !block.has(skill.name));
  }

  return skills;
}

export function requireSkill(
  name: string,
  workdir: string,
  settings: Settings,
): SkillInfo {
  const skills = discoverSkills(workdir, settings);
  const skill = skills.find((s) => s.name === name);
  if (skill) return skill;
  const available = skills.map((s) => s.name);
  throw new Error(
    `Skill "${name}" not found. Available skills: ${available.join(", ") || "none"}`,
  );
}

export function listSkillSiblingFiles(skillDir: string, limit = 10): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) return;
      const full = join(dir, entry.name);
      if (entry.name === "SKILL.md") continue;
      if (entry.isFile()) files.push(full);
      else if (entry.isDirectory() && !entry.name.startsWith(".")) walk(full);
    }
  }

  walk(skillDir);
  return files;
}

export function formatSkillToolOutput(skill: SkillInfo): string {
  const dir = dirname(skill.location);
  const base = pathToFileURL(dir).href;
  const files = listSkillSiblingFiles(dir);

  return [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    "",
    skill.content,
    "",
    `Base directory for this skill: ${base}`,
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
    "",
    "<skill_files>",
    ...files.map((file) => `  <file>${file}</file>`),
    "</skill_files>",
    "</skill_content>",
  ].join("\n");
}

export function formatSkillsCatalog(skills: SkillInfo[]): string | undefined {
  const described = skills.filter((skill) => skill.description);
  if (described.length === 0) return undefined;

  return [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    "<available_skills>",
    ...described.flatMap((skill) => [
      "  <skill>",
      `    <name>${skill.name}</name>`,
      `    <description>${skill.description}</description>`,
      "  </skill>",
    ]),
    "</available_skills>",
  ].join("\n");
}

export function formatSkillsListMessage(workdir: string, settings: Settings): string {
  const skills = discoverSkills(workdir, settings);
  if (skills.length === 0) {
    return [
      "No skills installed.",
      "",
      "Install from the Vercel skills ecosystem:",
      "  agent skills add vercel-labs/agent-skills",
      "  agent skills add vercel-labs/agent-skills -g",
      "  agent skills find react",
      "",
      SKILLS_BROWSE_HINT,
      "",
      "Skills are read from .agents/skills/ (project) and ~/.config/agents/skills/ (global).",
    ].join("\n");
  }

  return [
    "Installed skills:",
    ...skills.map(
      (skill) =>
        `- ${skill.name}: ${skill.description ?? "(no description)"}\n  ${skill.location}`,
    ),
    "",
    "Install more: agent skills add <owner/repo>",
    "Load in chat: /skill <name> [prompt]",
  ].join("\n");
}

export type SkillCommandResult =
  | { type: "none" }
  | { type: "list" }
  | { type: "error"; message: string }
  | { type: "prompt"; content: string };

export function resolveSkillCommand(
  input: string,
  workdir: string,
  settings: Settings,
): SkillCommandResult {
  const trimmed = input.trim();
  if (trimmed === "/skills" || trimmed === "/skill") {
    return { type: "list" };
  }

  const match = trimmed.match(/^\/skill\s+(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return { type: "none" };

  const [, name, rest] = match;
  try {
    const skill = requireSkill(name!, workdir, settings);
    const userPart = rest?.trim() || "Follow the skill instructions above.";
    return {
      type: "prompt",
      content: `${formatSkillToolOutput(skill)}\n\n---\n\n${userPart}`,
    };
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isSkillPath(filePath: string): boolean {
  const resolved = resolve(filePath);
  const roots = [GLOBAL_CONFIG_AGENTS_SKILLS, GLOBAL_AGENTS_SKILLS, USER_SKILLS_DIR];

  return (
    roots.some((root) => resolved === root || resolved.startsWith(root + sep)) ||
    resolved.includes(`${sep}${AGENTS_DIR}${sep}skills${sep}`)
  );
}
