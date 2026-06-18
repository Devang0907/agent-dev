import { useEffect, useRef } from "react";
import type { Key } from "ink";
import { useInput as useInkInput, useStdin } from "ink";
import { isBackspaceChunk, isTerminalNoise } from "./mouse.js";

type InputHandler = (input: string, key: Key) => void;

function isActionKey(key: Key): boolean {
  return (
    key.return ||
    key.escape ||
    key.tab ||
    key.backspace ||
    key.delete ||
    key.upArrow ||
    key.downArrow ||
    key.leftArrow ||
    key.rightArrow ||
    key.pageUp ||
    key.pageDown
  );
}

function normalizeKey(key: Key, treatAsBackspace: boolean): Key {
  if (!treatAsBackspace) return key;
  return { ...key, backspace: true, delete: false };
}

export function useAppInput(
  handler: InputHandler,
  options: { isActive?: boolean } = {},
): void {
  const { internal_eventEmitter } = useStdin();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const pendingBackspace = useRef(false);

  useEffect(() => {
    if (options.isActive === false) return;

    const markBackspace = (chunk: string) => {
      if (isBackspaceChunk(chunk)) {
        pendingBackspace.current = true;
      }
    };

    internal_eventEmitter?.prependListener("input", markBackspace);
    return () => {
      internal_eventEmitter?.removeListener("input", markBackspace);
    };
  }, [options.isActive, internal_eventEmitter]);

  useInkInput((input, key) => {
    const isBackspace = pendingBackspace.current || key.backspace;
    pendingBackspace.current = false;
    const normalizedKey = normalizeKey(key, isBackspace);

    // Block mouse/CSI garbage only — never swallow Enter, arrows, etc.
    if (input && isTerminalNoise(input) && !isActionKey(normalizedKey)) return;
    handlerRef.current(input, normalizedKey);
  }, options);
}
