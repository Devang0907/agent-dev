export type MouseWheelDirection = "up" | "down";

/** Enable SGR mouse mode (clicks + wheel) in supporting terminals. */
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h\x1b[?1007h";

export const DISABLE_MOUSE = "\x1b[?1007l\x1b[?1006l\x1b[?1000l";

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
  if (button === 64) return "up";
  if (button === 65) return "down";
  return undefined;
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

    if (data.startsWith("\x1b[<") || data.startsWith("[<")) {
      if (data.length > 32) {
        data = data.slice(1);
        continue;
      }
      break;
    }

    if (data.startsWith("\x1b[M") && data.length < 6) {
      break;
    }

    break;
  }

  return { wheels, rest: data };
}

/** Lines to scroll per wheel notch. */
export const WHEEL_SCROLL_LINES = 3;
