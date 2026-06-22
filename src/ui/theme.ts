export interface ThemeColors {
  text: string;
  textMuted: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  boss: string;
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
  border: "gray",
  borderActive: "white",
};

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
};
