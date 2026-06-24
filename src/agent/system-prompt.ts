import type { Model } from "../providers/types.js";
import type { Settings } from "../config/settings.js";
import type { AgentMode } from "./mode.js";
import { buildModeSystemAppend, getToolDefinitionsForMode, planModeSystemAppend } from "./mode.js";
import { getPlatformContext } from "./platform.js";
import { discoverSkills, formatSkillsCatalog } from "./skills.js";
import { discoverProjectRules } from "./project-rules.js";
import { loadMemorySummary } from "./tools/memory.js";
import { loadPlanSummary } from "./tools/plan.js";

const TOOL_SNIPPETS: Record<string, string> = {
  read: "Read file contents (path relative to project root)",
  write: "Create or overwrite a file with full content",
  edit: "Replace an exact string in a file (old_string must match exactly once)",
  diff: "Preview or show a diff before applying changes",
  grep: "Search the codebase by regex pattern",
  git: "Run read-only git commands; write actions need approval",
  bash: "Run shell commands on the user's real machine (requires approval). Dev servers (npm run dev, next dev) start in background and return a localhost URL.",
  exec: "Alias for bash with cmd array format; requires approval",
  web_search: "Search the web for current events and documentation",
  docs: "Look up library/API documentation",
  memory: "Store or recall facts across sessions",
  plan: "Create or update a multi-step task plan",
  database: "Run SQL queries; mutations need approval",
  verify: "Run tests or typecheck after code changes",
  mcp: "Call external MCP tools; mutations need approval",
  skill: "Load a specialized workflow skill by name",
  schedule: "Schedule Telegram reminders and daily recurring tasks",
  browser:
    "Control a real browser: navigate, click, type, extract, screenshot. Inspect with getPageContent first.",
};

const GUIDELINES = [
  "Be concise and direct. Prefer short confirmations over long summaries.",
  "Show file paths clearly when reading, writing, or editing files.",
  "Explore before changing: use grep and read to understand existing code and conventions.",
  "For multi-step work, create a plan first, then execute step by step.",
  "After code changes, run verify when a test or typecheck script exists.",
  "Use write or edit once with the full content — do not call the same tool repeatedly with identical arguments.",
  "Use docs for library/API questions; use web_search for news, releases, and current events.",
  "Use schedule for Telegram reminders (in_minutes) and daily tasks (daily_at + kind=task) — e.g. news every morning.",
  "Use the browser tool for web tasks: always getPageContent after search/navigation to see listings.",
  "For search boxes, browser type presses Enter automatically to submit — then call getPageContent to read results.",
  "Before purchases, bookings, or deletions in the browser, set requiresApproval: true and use waitForUser for CAPTCHA/OTP/payment.",
  "Never enter credit card numbers via the browser tool — ask the user to complete payment manually.",
  "Use the skill tool when a listed skill matches the task.",
  "git write actions, bash, exec, database mutations, mcp call_tool, and destructive browser actions require user approval — proceed only after approval.",
  "When the task is complete, reply briefly to confirm what was done.",
];

const EXECUTION_RULES = [
  "You run on the user's real local machine with full shell access. There is NO sandbox, container, or restricted execution environment.",
  "Never claim you cannot run commands, start servers, or execute code. Always use the bash tool when the user asks to run, start, or test an app.",
  "To run web apps (Next.js, Vite, React, etc.): cd into the project if needed, then bash with npm run dev, npm start, or next dev. The harness starts dev servers in the background and returns a localhost URL.",
  "You do not need to open a browser window yourself — start the dev server via bash and tell the user the URL to open in their browser.",
  "Never refuse to run dev servers or substitute instructions for the user to run locally — you ARE running locally. Use bash.",
];

const TOOL_CALLING_RULES = [
  "Always invoke tools through the function-calling API with valid JSON arguments.",
  "Never output text-based tool calls such as <function=name>(...) </function>, XML tags, or markdown code blocks pretending to be tool calls.",
  "Each tool call must use the exact tool name from the list and a JSON object for arguments.",
  "If you need multiple tools, issue separate tool calls — do not embed tool syntax in your text reply.",
];

function formatDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildToolsSection(mode: AgentMode = "build"): string {
  const all = Object.entries(TOOL_SNIPPETS);
  const filtered = getToolDefinitionsForMode(all.map(([name]) => ({ name })), mode);
  const allowed = new Set(filtered.map((t) => t.name));
  const lines = all.filter(([name]) => allowed.has(name)).map(([name, desc]) => `- ${name}: ${desc}`);
  if (mode === "plan") {
    lines.push("- write/edit: allowed ONLY for `.agent-dev/plans/*.md` plan files");
  }
  return lines.join("\n");
}

function buildGuidelinesSection(): string {
  return GUIDELINES.map((g) => `- ${g}`).join("\n");
}

function buildExecutionSection(): string {
  return EXECUTION_RULES.map((r) => `- ${r}`).join("\n");
}

function buildToolCallingSection(): string {
  return TOOL_CALLING_RULES.map((r) => `- ${r}`).join("\n");
}

export function buildDefaultSystemPrompt(workdir?: string, mode: AgentMode = "build"): string {
  const cwd = (workdir ?? process.cwd()).replace(/\\/g, "/");
  const date = formatDate();
  const modeSection = mode === "plan" ? planModeSystemAppend(cwd) : buildModeSystemAppend();

  return `You are an expert coding assistant operating inside agent-dev, a terminal coding agent harness. You help users by reading files, searching code, executing commands, editing code, and writing new files.

Available tools:
${buildToolsSection(mode)}

Guidelines:
${buildGuidelinesSection()}

Execution (critical — you have real shell access):
${buildExecutionSection()}

Tool calling (critical):
${buildToolCallingSection()}

Agent mode:
${modeSection}

Environment:
${getPlatformContext()}

Current date: ${date}
Current working directory: ${cwd}`;
}

export function buildSystemPrompt(
  workdir: string,
  settings: Settings,
  base?: string,
  sessionId?: string,
): string {
  const mode = settings.agentMode ?? "build";
  const core = base ?? buildDefaultSystemPrompt(workdir, mode);
  const memory = loadMemorySummary();
  const plan = loadPlanSummary(sessionId);
  const skills = formatSkillsCatalog(discoverSkills(workdir, settings));
  const rules = discoverProjectRules(workdir, settings);
  const extras: string[] = [];

  if (skills) extras.push(skills);
  if (rules.text) extras.push(`Project rules:\n${rules.text}`);
  if (memory) extras.push("Stored memories:\n" + memory);
  if (plan) extras.push("Active plan:\n" + plan);

  if (extras.length === 0) return core;
  return `${core}\n\n${extras.join("\n\n")}`;
}

export function systemPromptForModel(model: Model, base?: string): string {
  const prompt = base ?? buildDefaultSystemPrompt();

  const toolCallingNote = `
- Use structured function calls only — never output text claiming you cannot run commands or that you are in a sandbox.
- When the user asks to run or start an app, call bash immediately (e.g. npm run dev) — do not give manual setup instructions instead.
- Pass arguments as a JSON object, e.g. {"command": "npm run dev"} for bash.`;

  if (model.provider === "groq") {
    const gptOssNote = model.id.includes("gpt-oss")
      ? `
- GPT-OSS: use exact tool names only (browser, read, grep, bash, etc.). Never append <|channel|>, commentary, or other tokens to tool names.
- GPT-OSS: you have real shell access on the user's machine. Never say you are in a sandbox or cannot run dev servers — use bash.`
      : "";
    return `${prompt}

Provider note (Groq):
- Use structured function calls only — the API rejects any <function=...> text in the model output.
- Pass arguments as a JSON object, e.g. {"query": "search terms"} for web_search, {"command": "npm run dev"} for bash.
- Do not wrap arguments in parentheses or output pseudo-JSON outside the tool-call channel.${gptOssNote}`;
  }

  if (model.provider === "free" && model.id.includes("gpt-oss")) {
    return `${prompt}

Provider note (GPT-OSS via OpenRouter):
- Use exact tool names only (browser, read, grep, bash, etc.). Never append <|channel|>, commentary, or other tokens to tool names.
- You run on the user's real machine with full shell access. Never claim sandbox limitations or inability to run apps — use bash to start dev servers.${toolCallingNote}`;
  }

  if (model.provider === "free") {
    return `${prompt}

Provider note (OpenRouter free):
- Use structured function calls for all actions.${toolCallingNote}`;
  }

  return prompt;
}
