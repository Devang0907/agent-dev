import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import { SessionManager, type SessionSummary } from "../session/manager.js";
import { clamp } from "./scroll.js";
import { useMouseScroll } from "./useMouseScroll.js";
import { WHEEL_SCROLL_LINES } from "./mouse.js";

interface SessionSelectorProps {
  theme: ThemeColors;
  currentSessionId: string;
  viewportHeight: number;
  contentWidth: number;
  refreshKey?: number;
  onSelect: (session: SessionSummary) => void;
  onClose: () => void;
}

function formatSessionTime(date: Date): string {
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

const HEADER_ROWS = 2;

export function SessionSelector({
  theme,
  currentSessionId,
  viewportHeight,
  contentWidth,
  refreshKey = 0,
  onSelect,
  onClose,
}: SessionSelectorProps) {
  const sessions = useMemo(() => SessionManager.listSessions(), [refreshKey]);
  const listHeight = Math.max(4, viewportHeight - HEADER_ROWS);

  const [index, setIndex] = useState(() =>
    Math.max(0, sessions.findIndex((s) => s.sessionId === currentSessionId)),
  );
  const [listScroll, setListScroll] = useState(0);

  const safeIndex = Math.min(index, Math.max(0, sessions.length - 1));
  const maxListScroll = Math.max(0, sessions.length - listHeight);

  useEffect(() => {
    setListScroll((prev) => {
      if (safeIndex < prev) return safeIndex;
      if (safeIndex >= prev + listHeight) return safeIndex - listHeight + 1;
      return clamp(prev, 0, maxListScroll);
    });
  }, [safeIndex, listHeight, maxListScroll]);

  useMouseScroll(
    (direction) => {
      setIndex((i) => {
        const delta = direction === "up" ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES;
        return Math.max(0, Math.min(sessions.length - 1, i + delta));
      });
    },
    { isActive: true },
  );

  useInput(
    (_, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow || key.pageUp) {
        setIndex((i) => Math.max(0, i - (key.pageUp ? 5 : 1)));
        return;
      }
      if (key.downArrow || key.pageDown) {
        setIndex((i) => Math.min(sessions.length - 1, i + (key.pageDown ? 5 : 1)));
        return;
      }
      if (key.return && sessions[safeIndex]) {
        onSelect(sessions[safeIndex]);
      }
    },
    { isActive: true },
  );

  const visible = sessions.slice(listScroll, listScroll + listHeight);
  const timeWidth = 10;
  const metaWidth = 14;
  const titleWidth = Math.max(16, contentWidth - timeWidth - metaWidth - 4);

  return (
    <Box flexDirection="column" height={viewportHeight} flexShrink={0} paddingX={2}>
      <Text color={theme.text} bold>
        /sessions
      </Text>
      <Text color={theme.textMuted}>
        ↑↓ move · wheel scroll · Enter open · Esc close
        {sessions.length > 0 && (
          <>
            {" "}
            · {safeIndex + 1}/{sessions.length}
          </>
        )}
      </Text>

      <Box flexDirection="column" marginTop={1} height={listHeight} overflow="hidden">
        {sessions.length === 0 && <Text color={theme.textMuted}>No saved sessions yet</Text>}
        {visible.map((session, row) => {
          const i = listScroll + row;
          const selected = i === safeIndex;
          const current = session.sessionId === currentSessionId;
          const time = formatSessionTime(session.updatedAt).padEnd(timeWidth);
          const title = truncate(session.title, titleWidth);
          const meta = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}${current ? " · now" : ""}`;

          return (
            <Text key={session.sessionId} color={selected ? theme.primary : theme.text}>
              {selected ? "› " : "  "}
              <Text color={theme.textMuted}>{time} </Text>
              {title}
              <Text color={theme.textMuted}> {truncate(meta, metaWidth)}</Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
