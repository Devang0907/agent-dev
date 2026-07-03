import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import { agentColor, SPINNER_FRAMES } from "./theme.js";

export interface AgentRunInfo {
  runId: string;
  agentId: string;
  model?: string;
  status: "running" | "success" | "error" | "aborted";
  lastTool?: string;
  startedAt: number;
  endedAt?: number;
}

interface AgentStatusPanelProps {
  theme: ThemeColors;
  runs: AgentRunInfo[];
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function statusBadge(status: AgentRunInfo["status"], spinnerFrame: string): string {
  switch (status) {
    case "running":
      return spinnerFrame;
    case "success":
      return "✓";
    case "error":
      return "✗";
    case "aborted":
      return "⊘";
  }
}

export function AgentStatusPanel({ theme, runs }: AgentStatusPanelProps) {
  const anyRunning = runs.some((r) => r.status === "running");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  if (runs.length === 0) return null;

  const now = Date.now();
  const spinnerFrame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length]!;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.multi}
      paddingX={1}
      marginX={2}
      marginBottom={0}
      flexShrink={0}
    >
      <Text color={theme.multi}>Agents</Text>
      {runs.map((run, index) => {
        const color = agentColor(index);
        const elapsed = formatElapsed((run.endedAt ?? now) - run.startedAt);
        const statusColor =
          run.status === "running"
            ? theme.text
            : run.status === "success"
              ? theme.success
              : run.status === "error"
                ? theme.error
                : theme.warning;
        return (
          <Text key={run.runId} color={theme.textMuted}>
            <Text color={statusColor}>{statusBadge(run.status, spinnerFrame)} </Text>
            <Text color={color}>
              {run.agentId}#{run.runId}
            </Text>
            {run.model ? <Text color={theme.textMuted}> {run.model}</Text> : null}
            {" · "}
            <Text color={statusColor}>{run.status}</Text>
            {run.status === "running" && run.lastTool ? ` · ${run.lastTool}` : ""}
            {" · "}
            {elapsed}
          </Text>
        );
      })}
    </Box>
  );
}
