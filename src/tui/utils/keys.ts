import type { CliRenderer, EditBufferRenderable, KeyEvent } from "@opentui/core";

type KeyHandler = (key: KeyEvent) => void;

export function attachKeyHandler(renderer: CliRenderer, handler: KeyHandler): () => void {
  renderer.keyInput.on("keypress", handler);
  return () => renderer.keyInput.off("keypress", handler);
}

export function focusEditor(renderer: CliRenderer | undefined, editor: EditBufferRenderable | undefined): void {
  if (!renderer || !editor || editor.isDestroyed) return;
  renderer.focusRenderable(editor);
  editor.focus();
}

export function isPrintableKey(key: KeyEvent): boolean {
  return Boolean(
    key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      key.name !== "escape" &&
      key.name !== "tab" &&
      key.name !== "return" &&
      key.name !== "kpenter",
  );
}
