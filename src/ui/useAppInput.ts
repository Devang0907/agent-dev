import type { Key } from "ink";
import { useInput as useInkInput } from "ink";
import { isTerminalNoise } from "./mouse.js";

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

export function useAppInput(
  handler: InputHandler,
  options: { isActive?: boolean } = {},
): void {
  useInkInput((input, key) => {
    // Block mouse/CSI garbage only — never swallow Enter, arrows, etc.
    if (input && isTerminalNoise(input) && !isActionKey(key)) return;
    handler(input, key);
  }, options);
}
