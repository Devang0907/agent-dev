import { useStdout } from "ink";
import { useEffect, useState } from "react";

export interface TerminalSize {
  rows: number;
  cols: number;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    rows: stdout.rows,
    cols: stdout.columns,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({ rows: stdout.rows, cols: stdout.columns });
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}

export function chatContentWidth(cols: number): number {
  return Math.max(20, cols - 12);
}
