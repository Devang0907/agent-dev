export type MouseWheelDirection = "up" | "down";

/** SGR mouse tracking for wheel events. Do not enable 1007 — it hijacks wheel as arrow keys. */
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h";

export const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1000l";

const SGR_MOUSE_WITH_ESC = /^\x1b\[<(\d+);(\d+);(\d+)([mM])/;
const SGR_MOUSE_NO_ESC = /^\[<(\d+);(\d+);(\d+)([mM])/;

/** True when Ink forwards terminal control/mouse bytes as printable text. */
export function isTerminalNoise(input: string): boolean {
  if (!input) return false;
  if (input.includes("\x1b")) return true;
  if (/\[<[0-9;]+[mM]/.test(input)) return true;
  if (/^[0-9;]+[mM]?$/.test(input)) return true;
  if (/^<[\d;]+[mM]?$/.test(input)) return true;
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function isPrintableTextInput(input: string): boolean {
  if (!input || isTerminalNoise(input)) return false;
  return true;
}

function wheelFromButton(button: number): MouseWheelDirection | undefined {
  // SGR extended (xterm, Windows Terminal, VS Code)
  if (button === 64 || button === 36) return "up";
  if (button === 65 || button === 37) return "down";
  // Unencoded / legacy values
  if (button === 4) return "up";
  if (button === 5) return "down";
  return undefined;
}

function findMouseStart(data: string): number {
  const candidates = [data.indexOf("\x1b[<"), data.indexOf("[<"), data.indexOf("\x1b[M")].filter(
    (i) => i >= 0,
  );
  return candidates.length > 0 ? Math.min(...candidates) : -1;
}

function looksLikeIncompleteMouse(data: string): boolean {
  if (data.startsWith("\x1b[<") || data.startsWith("[<")) return data.length <= 32;
  if (data.startsWith("\x1b[M")) return data.length < 6;
  return false;
}

function tryConsumeMouseSequence(data: string): { consumed: number; wheel?: MouseWheelDirection } {
  const withEsc = SGR_MOUSE_WITH_ESC.exec(data);
  if (withEsc) {
    return {
      consumed: withEsc[0].length,
      wheel: wheelFromButton(parseInt(withEsc[1], 10)),
    };
  }

  const noEsc = SGR_MOUSE_NO_ESC.exec(data);
  if (noEsc) {
    return {
      consumed: noEsc[0].length,
      wheel: wheelFromButton(parseInt(noEsc[1], 10)),
    };
  }

  if (data.startsWith("\x1b[M") && data.length >= 6) {
    const button = data.charCodeAt(3) - 32;
    return {
      consumed: 6,
      wheel: button === 4 ? "up" : button === 5 ? "down" : undefined,
    };
  }

  return { consumed: 0 };
}

export interface MouseConsumeResult {
  wheels: MouseWheelDirection[];
  rest: string;
}

export function consumeMouseInput(buffer: string, chunk: string): MouseConsumeResult {
  let data = buffer + chunk;
  const wheels: MouseWheelDirection[] = [];

  while (data.length > 0) {
    const { consumed, wheel } = tryConsumeMouseSequence(data);
    if (consumed > 0) {
      if (wheel) wheels.push(wheel);
      data = data.slice(consumed);
      continue;
    }

    const mouseStart = findMouseStart(data);
    if (mouseStart > 0) {
      data = data.slice(mouseStart);
      continue;
    }

    if (looksLikeIncompleteMouse(data)) {
      break;
    }

    data = "";
    break;
  }

  return { wheels, rest: data };
}

/** Lines to scroll per wheel notch. */
export const WHEEL_SCROLL_LINES = 3;
