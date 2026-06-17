import type { WriteStream } from "node:tty";

/** Nudge the terminal viewport toward the latest output (best-effort across terminals). */
export function scrollViewportToBottom(stdout: WriteStream): void {
  stdout.write("\x1b[999T");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) breakAt = width;
      lines.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    lines.push(remaining);
  }
  return lines.length > 0 ? lines : [""];
}

const FOOTER_ROWS = 3;
const EDITOR_ROWS = 7;

export function safeTerminalRows(rows: number | undefined): number {
  return rows && rows > 0 ? rows : 24;
}

export function chatViewportHeight(rows: number | undefined): number {
  return Math.max(6, safeTerminalRows(rows) - FOOTER_ROWS - EDITOR_ROWS);
}

/** null = follow the latest output (pinned to bottom). */
export function effectiveScrollTop(offset: number | null, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  if (offset === null) return maxScroll;
  return clamp(offset, 0, maxScroll);
}

export function isFollowing(offset: number | null, maxScroll: number): boolean {
  return offset === null || offset >= maxScroll;
}
