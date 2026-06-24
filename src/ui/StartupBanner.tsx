import React, { memo } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { UpdateInfo } from "../version/check.js";
import { UPDATE_COMMAND } from "../version/check.js";

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
  updateInfo?: UpdateInfo | null;
}

type ThemeAccents = {
  border?: string;
  dim?: string;
};

function UpdateNotice({
  theme,
  updateInfo,
  dimColor,
  compact,
}: {
  theme: ThemeColors;
  updateInfo: UpdateInfo;
  dimColor: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Box marginTop={1}>
        <Text color={theme.warning}>
          ↑ v{updateInfo.latest} available
        </Text>
        <Text color={dimColor}> · run: {UPDATE_COMMAND}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.warning}>
        ↑ New version {updateInfo.latest} available (you have {updateInfo.current})
      </Text>
      <Text color={dimColor}>Run: {UPDATE_COMMAND}</Text>
    </Box>
  );
}

export const StartupBanner = memo(function StartupBanner({
  theme,
  compact,
  tagline = "Autonomous coding agent for your terminal",
  updateInfo,
}: StartupBannerProps) {
  const accents = theme as ThemeAccents;

  const borderColor = accents.border ?? LOGO_COLOR;
  const dimColor = accents.dim ?? "gray";

  if (compact) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={LOGO_COLOR} bold>
            ✦ AGENT-DEV
          </Text>
          <Text color={dimColor}>{" · " + tagline}</Text>
        </Box>
        {updateInfo ? (
          <UpdateNotice theme={theme} updateInfo={updateInfo} dimColor={dimColor} compact />
        ) : null}
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

        {updateInfo ? (
          <UpdateNotice theme={theme} updateInfo={updateInfo} dimColor={dimColor} />
        ) : null}
      </Box>
    </Box>
  );
});
