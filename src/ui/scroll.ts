import type { WriteStream } from "node:tty";

/** Nudge the terminal viewport toward the latest output (best-effort across terminals). */
export function scrollViewportToBottom(stdout: WriteStream): void {
  stdout.write("\x1b[999T");
}
