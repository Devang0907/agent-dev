import React from "react";
import { Box } from "ink";
import type { ThemeColors } from "./theme.js";

interface PanelProps {
  theme: ThemeColors;
  marginBottom?: number;
  flexGrow?: number;
  borderColor?: string;
  children: React.ReactNode;
}

export function Panel({
  theme,
  marginBottom = 1,
  flexGrow,
  borderColor = theme.border,
  children,
}: PanelProps) {
  return (
    <Box
      flexDirection="column"
      flexGrow={flexGrow}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={1}
      marginX={2}
      marginBottom={marginBottom}
    >
      {children}
    </Box>
  );
}
