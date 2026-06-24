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
  background: string;
  backgroundPanel: string;
  backgroundElement: string;
  dialogScrim: string;
}

/** Agent-Dev palette — cyan primary, extended with OpenCode-style tiers */
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
  background: "black",
  backgroundPanel: "#1a1a1a",
  backgroundElement: "#2a2a2a",
  dialogScrim: "#4a4a4a",
};

export const LOGO_COLOR = "#f36b33";

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
