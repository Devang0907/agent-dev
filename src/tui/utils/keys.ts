import type { CliRenderer, EditBufferRenderable, KeyEvent } from "@opentui/core";

export type KeyHandler = (key: KeyEvent) => void;

let overlayHandler: KeyHandler | null = null;
let auxiliaryHandler: KeyHandler | null = null;
let promptHandler: KeyHandler | null = null;
let chromeHandler: KeyHandler | null = null;
let installedRenderer: CliRenderer | null = null;

function dispatch(key: KeyEvent): void {
  if (chromeHandler) {
    chromeHandler(key);
    if (key.defaultPrevented) return;
  }
  if (overlayHandler) {
    overlayHandler(key);
    if (key.defaultPrevented) return;
  }
  if (auxiliaryHandler) {
    auxiliaryHandler(key);
    if (key.defaultPrevented) return;
  }
  if (promptHandler && !key.defaultPrevented) {
    promptHandler(key);
  }
}

export function installKeyRouter(renderer: CliRenderer): void {
  if (installedRenderer === renderer) return;
  installedRenderer = renderer;
  renderer.keyInput.on("keypress", dispatch);
}

export function clearOverlayKeyHandler(): void {
  overlayHandler = null;
}

export function setOverlayKeyHandler(handler: KeyHandler | null): void {
  overlayHandler = handler;
}

export function setAuxiliaryKeyHandler(handler: KeyHandler | null): void {
  auxiliaryHandler = handler;
}

export function setPromptKeyHandler(handler: KeyHandler | null): void {
  promptHandler = handler;
}

export function setChromeKeyHandler(handler: KeyHandler | null): void {
  chromeHandler = handler;
}

/** @deprecated Use installKeyRouter + set*KeyHandler instead. */
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
