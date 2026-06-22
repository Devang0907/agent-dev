import React from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { PermissionRequest } from "../agent/loop.js";
import { LeftBorder } from "./LeftBorder.js";

interface CommandApprovalPromptProps {
  theme: ThemeColors;
  request: PermissionRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function CommandApprovalPrompt({
  theme,
  request,
  onApprove,
  onDeny,
}: CommandApprovalPromptProps) {
  useInput(
    (input, key) => {
      if (input === "y" || input === "Y") {
        onApprove();
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        onDeny();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginX={2} marginTop={1} marginBottom={1}>
      <LeftBorder theme={theme} borderColor={theme.warning}>
        <Text color={theme.text} bold>
          Approve this action?
        </Text>
        {request.workerId && request.runId ? (
          <Text color={theme.textMuted}>
            {" "}
            Worker {request.workerId} #{request.runId}
          </Text>
        ) : null}
        <Text color={theme.textMuted}> y approve · n or Esc deny</Text>

        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={theme.warning}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.text}>{request.command}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.textMuted}>
            The agent wants to run this command in your project directory.
          </Text>
        </Box>
      </LeftBorder>
    </Box>
  );
}
