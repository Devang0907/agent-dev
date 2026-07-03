export interface ThemeColors {
  text: string;
  textMuted: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  boss: string;
  multi: string;
  border: string;
  borderActive: string;
}

/** OpenCode-inspired palette — standard terminal ANSI colors */
export const theme: ThemeColors = {
  text: "white",
  textMuted: "gray",
  primary: "cyan",
  secondary: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
  boss: "magenta",
  multi: "blueBright",
  border: "gray",
  borderActive: "white",
};

/** Stable per-agent accent colors for parallel multi-agent output. */
export const AGENT_COLORS = ["cyan", "yellow", "green", "magenta", "blue", "red"] as const;

export function agentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]!;
}

export function getTheme(): ThemeColors {
  return theme;
}

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "→",
  write: "⚙",
  edit: "%",
  diff: "±",
  grep: "⌕",
  git: "⎇",
  web_search: "⌕",
  docs: "◈",
  memory: "★",
  plan: "☐",
  database: "▣",
  verify: "✓",
  mcp: "⬡",
  browser: "🌐",
};
