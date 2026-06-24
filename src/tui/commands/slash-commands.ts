export const SLASH_COMMANDS = [
  { cmd: "/model", desc: "Select provider & model", aliases: ["/m"] as const },
  { cmd: "/settings", desc: "Thinking level & API keys" },
  { cmd: "/connect", desc: "Configure gateway connection (Telegram)" },
  { cmd: "/build", desc: "Switch to Build mode (full tool access)" },
  { cmd: "/plan", desc: "Switch to Plan mode (read-only exploration)" },
  { cmd: "/boss", desc: "Toggle boss orchestrator mode" },
  { cmd: "/trace", desc: "Show latest worker trace log path" },
  { cmd: "/compact", desc: "Summarize older messages to free context" },
  { cmd: "/rules", desc: "Show loaded project rule files" },
  { cmd: "/permissions", desc: "Show permission presets for this project" },
  { cmd: "/tasks", desc: "Show the active task plan (use /tasks clear to reset)" },
  { cmd: "/skills", desc: "Browse and install Vercel skills" },
  { cmd: "/skill", desc: "Load a skill for one turn" },
  { cmd: "/sessions", desc: "Browse saved chat sessions" },
  { cmd: "/new", desc: "New session" },
  { cmd: "/quit", desc: "Exit" },
] as const;

export interface InputSuggestion {
  cmd: string;
  desc: string;
  label?: string;
}

export interface SkillNameOption {
  name: string;
  description?: string;
}

function skillSuggestion(skill: SkillNameOption): InputSuggestion {
  return {
    cmd: `/skill ${skill.name}`,
    label: skill.name,
    desc: formatOneLineDescription(skill.description ?? ""),
  };
}

export function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (prefix && !strings[i]!.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

export function isModelCommand(input: string): boolean {
  const trimmed = input.trim();
  return trimmed === "/m" || trimmed === "/model" || trimmed.startsWith("/m ") || trimmed.startsWith("/model ");
}

export function matchSlashCommands(input: string): (typeof SLASH_COMMANDS)[number][] {
  if (!input.startsWith("/")) return [];
  return SLASH_COMMANDS.filter((c) => {
    if (c.cmd.startsWith(input)) return true;
    const aliases = "aliases" in c ? c.aliases : undefined;
    return aliases?.some((a) => a.startsWith(input) || input === a || input.startsWith(`${a} `));
  });
}

export function matchSkillSuggestions(
  input: string,
  skills: SkillNameOption[],
): InputSuggestion[] | null {
  if (input === "/skill") return skills.map(skillSuggestion);
  const match = input.match(/^\/skill\s+(\S*)$/);
  if (!match) return null;
  const partial = match[1] ?? "";
  return skills.filter((skill) => skill.name.startsWith(partial)).map(skillSuggestion);
}

export function formatOneLineDescription(desc: string, maxLen = 56): string {
  const one = desc.replace(/\s+/g, " ").trim();
  if (!one) return "";
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1)}…`;
}

export function getInputSuggestions(input: string, skills: SkillNameOption[]): InputSuggestion[] {
  const skillSuggestions = matchSkillSuggestions(input, skills);
  if (skillSuggestions !== null) return skillSuggestions;
  if (input.startsWith("/")) {
    return matchSlashCommands(input).map((c) => ({ cmd: c.cmd, desc: c.desc }));
  }
  return [];
}

export function completeSlashInput(input: string): string | null {
  const matches = matchSlashCommands(input).map((c) => c.cmd);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  const common = longestCommonPrefix(matches);
  return common.length > input.length ? common : null;
}

export function completeSkillInput(input: string, skills: SkillNameOption[]): string | null {
  if (input === "/skill") return "/skill ";
  const match = input.match(/^\/skill\s+(\S*)$/);
  if (!match) return null;
  const partial = match[1] ?? "";
  const matches = skills.filter((skill) => skill.name.startsWith(partial));
  if (matches.length === 0) return null;
  if (matches.length === 1) return `/skill ${matches[0]!.name} `;
  const common = longestCommonPrefix(matches.map((s) => s.name));
  if (common.length > partial.length) return `/skill ${common}`;
  return null;
}

export function completeInput(input: string, skills: SkillNameOption[]): string | null {
  const skillDone = completeSkillInput(input, skills);
  if (skillDone !== null) return skillDone;
  if (input.startsWith("/")) return completeSlashInput(input);
  return null;
}
