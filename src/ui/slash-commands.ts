export const SLASH_COMMANDS = [
  { cmd: "/model", desc: "Select provider & model" },
  { cmd: "/settings", desc: "Thinking level & API keys" },
  { cmd: "/new", desc: "New session" },
  { cmd: "/quit", desc: "Exit" },
] as const;

export function matchSlashCommands(input: string): typeof SLASH_COMMANDS[number][] {
  if (!input.startsWith("/")) return [];
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input));
}

export function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (prefix && !strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

export function completeSlashInput(input: string): string | null {
  const matches = matchSlashCommands(input).map((c) => c.cmd);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const common = longestCommonPrefix(matches);
  return common.length > input.length ? common : null;
}
