import React from "react";
import { Box } from "ink";
import type { ThemeColors } from "./theme.js";

interface LeftBorderProps {
  theme: ThemeColors;
  borderColor?: string;
  marginBottom?: number;
  children: React.ReactNode;
}

/** OpenCode-style left ┃ accent border */
export function LeftBorder({
  theme,
  borderColor = theme.primary,
  marginBottom = 0,
  children,
}: LeftBorderProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={marginBottom}
    >
      {children}
    </Box>
  );
}
