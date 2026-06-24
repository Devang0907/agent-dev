import type { ParentProps } from "solid-js";
import { useTheme } from "../theme/provider.js";

interface LeftBorderProps extends ParentProps {
  borderColor?: string;
  marginBottom?: number;
}

/** OpenCode-style left ┃ accent border */
export function LeftBorder(props: LeftBorderProps) {
  const theme = useTheme();
  return (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={props.borderColor ?? theme.primary}
      border={["left"]}
      paddingLeft={1}
      marginBottom={props.marginBottom ?? 0}
    >
      {props.children}
    </box>
  );
}
