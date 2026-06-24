import { existsSync, readFileSync } from "node:fs";
import type { Settings } from "../config/settings.js";
import { getProjectPermissionsPath } from "../config/paths.js";
import { isGitWriteAction, formatGitPermissionCommand } from "./tools/git.js";
import { isSelectOnlyQuery, formatDatabasePermissionCommand } from "./tools/database.js";
import { commandFromExecArgs } from "./tools/read.js";
import { formatMcpPermissionCommand } from "./tools/mcp.js";
import { BROWSER_INTERACTION_ACTIONS } from "./tools/browser/types.js";
import type { BrowserToolArgs } from "./tools/browser/types.js";
import {
  isDestructiveBrowserAction,
  formatBrowserPermissionCommand,
} from "./tools/browser/detectors.js";
import { resolveVerifyCommand } from "./tools/verify.js";

export type PermissionAction = "allow" | "ask" | "deny";

export type PermissionCategory = "bash" | "git" | "database" | "mcp" | "browser" | "files";

export type PermissionRuleValue = PermissionAction | Record<string, PermissionAction>;

export type PermissionRulesConfig = Partial<Record<PermissionCategory, PermissionRuleValue>>;

export interface MergedPermissionRules {
  bash: Array<[string, PermissionAction]>;
  git: Array<[string, PermissionAction]>;
  database: Array<[string, PermissionAction]>;
  mcp: Array<[string, PermissionAction]>;
  browser: Array<[string, PermissionAction]>;
  files: Array<[string, PermissionAction]>;
}

const EMPTY_RULES: MergedPermissionRules = {
  bash: [],
  git: [],
  database: [],
  mcp: [],
  browser: [],
  files: [],
};

function normalizeRulesEntry(value: PermissionRuleValue): Array<[string, PermissionAction]> {
  if (typeof value === "string") {
    return [["*", value]];
  }
  return Object.entries(value) as Array<[string, PermissionAction]>;
}

function mergeCategoryRules(
  globalRules: PermissionRulesConfig,
  projectRules: PermissionRulesConfig,
  category: PermissionCategory,
): Array<[string, PermissionAction]> {
  const merged: Array<[string, PermissionAction]> = [];
  const globalEntry = globalRules[category];
  const projectEntry = projectRules[category];
  if (globalEntry) merged.push(...normalizeRulesEntry(globalEntry));
  if (projectEntry) merged.push(...normalizeRulesEntry(projectEntry));
  return merged;
}

export function loadProjectPermissionRules(workdir: string): PermissionRulesConfig {
  const path = getProjectPermissionsPath(workdir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PermissionRulesConfig;
  } catch {
    return {};
  }
}

export function loadMergedPermissionRules(workdir: string, settings: Settings): MergedPermissionRules {
  const globalRules = settings.permissions ?? {};
  const projectRules = loadProjectPermissionRules(workdir);
  const hasGlobal = Object.keys(globalRules).length > 0;
  const hasProject = Object.keys(projectRules).length > 0;
  if (!hasGlobal && !hasProject) {
    return { ...EMPTY_RULES };
  }
  return {
    bash: mergeCategoryRules(globalRules, projectRules, "bash"),
    git: mergeCategoryRules(globalRules, projectRules, "git"),
    database: mergeCategoryRules(globalRules, projectRules, "database"),
    mcp: mergeCategoryRules(globalRules, projectRules, "mcp"),
    browser: mergeCategoryRules(globalRules, projectRules, "browser"),
    files: mergeCategoryRules(globalRules, projectRules, "files"),
  };
}

export function matchPermissionPattern(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.trim();
  const normalizedValue = value.trim();
  if (normalizedPattern === "*") return true;

  const caseInsensitive = process.platform === "win32";
  const p = caseInsensitive ? normalizedPattern.toLowerCase() : normalizedPattern;
  const v = caseInsensitive ? normalizedValue.toLowerCase() : normalizedValue;

  if (p.endsWith(" *")) {
    const prefix = p.slice(0, -2);
    return v === prefix || v.startsWith(`${prefix} `);
  }

  return v === p;
}

export function matchFilePermissionPattern(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.trim().replace(/\\/g, "/");
  const normalizedValue = value.trim().replace(/\\/g, "/");
  if (normalizedPattern === "*") return true;

  const caseInsensitive = process.platform === "win32";
  const p = caseInsensitive ? normalizedPattern.toLowerCase() : normalizedPattern;
  const v = caseInsensitive ? normalizedValue.toLowerCase() : normalizedValue;

  if (p.endsWith("/*")) {
    const prefix = p.slice(0, -2);
    return v === prefix || v.startsWith(`${prefix}/`);
  }

  if (p.startsWith("*.")) {
    const suffix = p.slice(1);
    return v.endsWith(suffix) || v.includes(`/${p.slice(2)}`);
  }

  return matchPermissionPattern(pattern, value);
}

export function resolvePermissionForCategory(
  rules: Array<[string, PermissionAction]>,
  matchValue: string,
  defaultAction: PermissionAction,
): PermissionAction {
  if (rules.length === 0) return defaultAction;

  let action = defaultAction;
  for (const [pattern, ruleAction] of rules) {
    if (matchPermissionPattern(pattern, matchValue)) {
      action = ruleAction;
    }
  }
  return action;
}

function isPermissionGatedTool(
  name: string,
  args: Record<string, unknown>,
  filesRulesConfigured: boolean,
): boolean {
  if (name === "write" || name === "edit") return filesRulesConfigured;
  if (name === "bash" || name === "exec" || name === "verify") return true;
  if (name === "git") return isGitWriteAction(String(args.action ?? ""));
  if (name === "database") return !isSelectOnlyQuery(String(args.query ?? ""));
  if (name === "mcp") return String(args.action ?? "").toLowerCase() === "call_tool";
  if (name === "browser") {
    const action = String(args.action ?? "");
    if (BROWSER_INTERACTION_ACTIONS.has(action as BrowserToolArgs["action"])) {
      return args.requiresApproval === true || isDestructiveBrowserAction(args as unknown as BrowserToolArgs);
    }
  }
  return false;
}

function permissionCategoryForTool(name: string): PermissionCategory | null {
  if (name === "bash" || name === "exec" || name === "verify") return "bash";
  if (name === "write" || name === "edit") return "files";
  if (name === "git") return "git";
  if (name === "database") return "database";
  if (name === "mcp") return "mcp";
  if (name === "browser") return "browser";
  return null;
}

function formatPermissionCommand(name: string, args: Record<string, unknown>): string {
  if (name === "bash" || name === "exec") {
    if (name === "exec") {
      return String(commandFromExecArgs(args) ?? "");
    }
    return String(args.command ?? "");
  }
  if (name === "git") return formatGitPermissionCommand(args);
  if (name === "database") return formatDatabasePermissionCommand(args);
  if (name === "mcp") return formatMcpPermissionCommand(args);
  if (name === "browser") return formatBrowserPermissionCommand(args as unknown as BrowserToolArgs);
  if (name === "verify") {
    const cmd = String(args.command ?? "").trim();
    return cmd ? `verify: ${cmd}` : "verify";
  }
  if (name === "write" || name === "edit") {
    return `${name} ${String(args.path ?? "").trim()}`;
  }
  return name;
}

function matchValueForTool(
  name: string,
  args: Record<string, unknown>,
  workdir?: string,
): string {
  if (name === "verify" && workdir) {
    return resolveVerifyCommand(
      args as { command?: string; type?: string },
      workdir,
    ) ?? "verify";
  }
  if (name === "write" || name === "edit") {
    return String(args.path ?? "").trim().replace(/\\/g, "/");
  }
  if (name === "git") {
    const action = String(args.action ?? "").trim();
    const extra = String(args.args ?? "").trim();
    return extra ? `${action} ${extra}` : action;
  }
  if (name === "mcp") {
    const action = String(args.action ?? "").toLowerCase();
    if (action !== "call_tool") return action;
    const server = String(args.server ?? "").trim();
    const tool = String(args.tool ?? "").trim();
    return server && tool ? `${server}/${tool}` : "call_tool";
  }
  if (name === "browser") {
    return formatPermissionCommand(name, args);
  }
  return formatPermissionCommand(name, args);
}

export function resolveToolPermission(
  name: string,
  args: Record<string, unknown>,
  workdir: string,
  settings: Settings,
): PermissionAction {
  const rules = loadMergedPermissionRules(workdir, settings);
  const filesRulesConfigured = rules.files.length > 0;

  if (!isPermissionGatedTool(name, args, filesRulesConfigured)) {
    return "allow";
  }

  const category = permissionCategoryForTool(name);
  if (!category) return "ask";

  const matchValue = matchValueForTool(name, args, workdir);
  const defaultAction = category === "files" ? "allow" : "ask";
  if (category === "files") {
    return resolveFilesPermission(rules.files, matchValue, defaultAction);
  }
  return resolvePermissionForCategory(rules[category], matchValue, defaultAction);
}

function resolveFilesPermission(
  rules: Array<[string, PermissionAction]>,
  matchValue: string,
  defaultAction: PermissionAction,
): PermissionAction {
  if (rules.length === 0) return defaultAction;

  let action = defaultAction;
  for (const [pattern, ruleAction] of rules) {
    if (matchFilePermissionPattern(pattern, matchValue)) {
      action = ruleAction;
    }
  }
  return action;
}

export function countPermissionRules(rules: MergedPermissionRules): Record<PermissionCategory, number> {
  return {
    bash: rules.bash.length,
    git: rules.git.length,
    database: rules.database.length,
    mcp: rules.mcp.length,
    browser: rules.browser.length,
    files: rules.files.length,
  };
}

export function formatPermissionRulesSummary(workdir: string, settings: Settings): string {
  const merged = loadMergedPermissionRules(workdir, settings);
  const counts = countPermissionRules(merged);
  const lines: string[] = ["Permission presets (last matching rule wins):"];

  for (const category of ["bash", "git", "database", "mcp", "browser", "files"] as const) {
    const rules = merged[category];
    if (rules.length === 0) continue;
    lines.push(`\n${category}:`);
    for (const [pattern, action] of rules) {
      lines.push(`  ${pattern} → ${action}`);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return "No permission presets configured. Gated tools default to ask (prompt for approval).\n\nGlobal: ~/.agent-dev/settings.json → permissions\nProject: .agent-dev/permissions.json";
  }

  lines.push("\nGlobal: ~/.agent-dev/settings.json → permissions");
  lines.push(`Project: ${getProjectPermissionsPath(workdir)}`);
  return lines.join("\n");
}
