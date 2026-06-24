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

export function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function shortPath(path: string, max = 56): string {
  if (path.length <= max) return path;
  return "…" + path.slice(-(max - 1));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const SIDEBAR_WIDTH = 42;
export const WIDE_BREAKPOINT = 120;

export function promptMaxWidth(cols: number): number {
  return Math.max(75, Math.floor(cols * 0.7));
}

export function contentWidth(cols: number, hasSidebar: boolean): number {
  const sidebar = hasSidebar ? SIDEBAR_WIDTH : 0;
  return Math.max(40, cols - sidebar - 4);
}
