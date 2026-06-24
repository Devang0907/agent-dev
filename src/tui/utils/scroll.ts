export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const FOOTER_ROWS = 3;
export const EDITOR_ROWS = 10;
export const MIN_CHAT_ROWS = 6;

export function safeTerminalRows(rows: number | undefined): number {
  return rows && rows > 0 ? rows : 24;
}

export function chatViewportHeight(
  rows: number | undefined,
  extraEditorRows = 0,
  minMainRows: number = MIN_CHAT_ROWS,
): number {
  return Math.max(
    minMainRows,
    safeTerminalRows(rows) - FOOTER_ROWS - EDITOR_ROWS - extraEditorRows,
  );
}

export function effectiveScrollTop(offset: number | null, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  if (offset === null) return maxScroll;
  return clamp(offset, 0, maxScroll);
}

export function isFollowing(offset: number | null, maxScroll: number): boolean {
  return offset === null || offset >= maxScroll;
}
