import type { Theme } from "../providers/types.js";

export interface ThemeColors {
  user: string;
  assistant: string;
  tool: string;
  border: string;
  muted: string;
  accent: string;
  error: string;
  header: string;
}

export const themes: Record<Theme, ThemeColors> = {
  dark: {
    user: "cyan",
    assistant: "white",
    tool: "yellow",
    border: "gray",
    muted: "gray",
    accent: "green",
    error: "red",
    header: "blue",
  },
  light: {
    user: "blue",
    assistant: "black",
    tool: "yellow",
    border: "gray",
    muted: "gray",
    accent: "green",
    error: "red",
    header: "blue",
  },
};

export function getTheme(theme: Theme): ThemeColors {
  return themes[theme];
}
