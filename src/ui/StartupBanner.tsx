import React, { memo } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";

const LOGO_COLOR = "#f36b33";

const LOGO = [
  " █████╗  ██████╗ ███████╗███╗   ██╗████████╗",
  "██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝",
  "███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║",
  "██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║",
  "██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║",
  "╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝",
  "",
  "██████╗ ███████╗██╗   ██╗",
  "██╔══██╗██╔════╝██║   ██║",
  "██║  ██║█████╗  ██║   ██║",
  "██║  ██║██╔══╝  ╚██╗ ██╔╝",
  "██████╔╝███████╗ ╚████╔╝",
  "╚═════╝ ╚══════╝  ╚═══╝",
];

interface StartupBannerProps {
  theme: ThemeColors;
  compact?: boolean;
  tagline?: string;
  animated?: boolean;
}

type ThemeAccents = {
  border?: string;
  dim?: string;
};

export const StartupBanner = memo(function StartupBanner({
  theme,
  compact,
  tagline = "Autonomous coding agent for your terminal",
}: StartupBannerProps) {
  const accents = theme as ThemeAccents;

  const borderColor = accents.border ?? LOGO_COLOR;
  const dimColor = accents.dim ?? "gray";

  if (compact) {
    return (
      <Box marginBottom={1}>
        <Text color={LOGO_COLOR} bold>
          ✦ AGENT-DEV
        </Text>
        <Text color={dimColor}>{" · " + tagline}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={3}
        paddingY={1}
      >
        {LOGO.map((line, index) => (
          <Text key={index} color={LOGO_COLOR} bold>
            {line}
          </Text>
        ))}

        <Box marginTop={1}>
          <Text color={LOGO_COLOR} bold>
            ✦{" "}
          </Text>
          <Text color={dimColor}>{tagline}</Text>
        </Box>
      </Box>
    </Box>
  );
});
