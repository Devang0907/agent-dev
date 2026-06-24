import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getConfigDir } from "../config/paths.js";
import type { Settings } from "../config/settings.js";
import { getProjectRulesSettings } from "../config/settings.js";
import { walkRootToLeaf } from "./workspace.js";

const RULE_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const;
const DEFAULT_MAX_CHARS = 32_768;

export interface ProjectRulesFile {
  path: string;
  content: string;
}

export interface ProjectRulesResult {
  files: ProjectRulesFile[];
  text: string;
}

function isProjectRulesDisabled(settings?: Settings): boolean {
  if (process.env.AGENT_NO_PROJECT_RULES === "1") return true;
  const cfg = getProjectRulesSettings(settings);
  return cfg.enabled === false;
}

function readRuleFile(path: string): ProjectRulesFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return undefined;
    return { path: resolve(path), content };
  } catch {
    return undefined;
  }
}

function collectRulesFragments(dir: string): ProjectRulesFile[] {
  const rulesDir = join(dir, ".agent-dev", "rules");
  if (!existsSync(rulesDir)) return [];

  let names: string[];
  try {
    names = readdirSync(rulesDir).filter((n) => n.endsWith(".md")).sort();
  } catch {
    return [];
  }

  const files: ProjectRulesFile[] = [];
  for (const name of names) {
    const file = readRuleFile(join(rulesDir, name));
    if (file) files.push(file);
  }
  return files;
}

export function discoverProjectRules(workdir: string, settings?: Settings): ProjectRulesResult {
  const files: ProjectRulesFile[] = [];
  if (isProjectRulesDisabled(settings)) {
    return { files, text: "" };
  }

  const cwd = resolve(workdir);
  const maxChars = getProjectRulesSettings(settings).maxChars ?? DEFAULT_MAX_CHARS;

  const globalFile = readRuleFile(join(getConfigDir(), "AGENTS.md"));
  if (globalFile) files.push(globalFile);

  for (const dir of walkRootToLeaf(cwd)) {
    for (const name of RULE_FILENAMES) {
      const file = readRuleFile(join(dir, name));
      if (file) files.push(file);
    }
  }

  const projectAgents = readRuleFile(join(cwd, ".agent-dev", "AGENTS.md"));
  if (projectAgents) files.push(projectAgents);

  files.push(...collectRulesFragments(cwd));

  if (files.length === 0) {
    return { files, text: "" };
  }

  const sections = files.map((f) => `<!-- ${f.path} -->\n${f.content}`);
  let text = sections.join("\n\n");
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n… [project rules truncated at ${maxChars.toLocaleString()} characters]`;
  }

  return { files, text };
}

export function formatProjectRulesSummary(result: ProjectRulesResult): string {
  if (result.files.length === 0) {
    return "No project rules loaded. Add AGENTS.md in the repo or ~/.agent-dev/AGENTS.md.";
  }
  return result.files.map((f) => f.path).join("\n");
}
