import { useEffect, useRef } from "react";
import { useStdin, useStdout } from "ink";
import {
  consumeMouseInput,
  DISABLE_MOUSE,
  ENABLE_MOUSE,
  type MouseWheelDirection,
} from "./mouse.js";

export function useMouseScroll(
  onWheel: (direction: MouseWheelDirection) => void,
  options: { isActive?: boolean } = {},
): void {
  const { internal_eventEmitter, isRawModeSupported } = useStdin();
  const { stdout } = useStdout();
  const bufferRef = useRef("");
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;

  useEffect(() => {
    if (options.isActive === false || !isRawModeSupported) return;

    stdout.write(ENABLE_MOUSE);

    const handleInput = (chunk: string) => {
      const { wheels, rest } = consumeMouseInput(bufferRef.current, chunk);
      bufferRef.current = rest;
      for (const wheel of wheels) {
        onWheelRef.current(wheel);
      }
    };

    internal_eventEmitter?.prependListener("input", handleInput);
    return () => {
      internal_eventEmitter?.removeListener("input", handleInput);
      stdout.write(DISABLE_MOUSE);
      bufferRef.current = "";
    };
  }, [options.isActive, internal_eventEmitter, stdout, isRawModeSupported]);
}
