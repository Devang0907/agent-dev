import { createContext, useContext } from "solid-js";
import type { ThemeColors } from "./tokens.js";
import { getTheme } from "./tokens.js";

const ThemeContext = createContext<ThemeColors>(getTheme());

export function ThemeProvider(props: { children: unknown }) {
  return (
    <ThemeContext.Provider value={getTheme()}>{props.children as never}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
