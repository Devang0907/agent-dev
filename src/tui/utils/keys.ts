import type { CliRenderer, KeyEvent } from "@opentui/core";

type KeyHandler = (key: KeyEvent) => void;

export function attachKeyHandler(renderer: CliRenderer, handler: KeyHandler): () => void {
  renderer.keyInput.on("keypress", handler);
  return () => renderer.keyInput.off("keypress", handler);
}
