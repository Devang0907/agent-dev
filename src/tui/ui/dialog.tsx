import { Show, type ParentProps } from "solid-js";
import { useTheme } from "../theme/provider.js";

interface DialogOverlayProps extends ParentProps {
  open: boolean;
  onClose: () => void;
}

export function DialogOverlay(props: DialogOverlayProps) {
  const theme = useTheme();
  return (
    <Show when={props.open}>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="rgba(0,0,0,0.6)"
        zIndex={3000}
        justifyContent="center"
        alignItems="center"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={theme.borderActive}
          backgroundColor={theme.backgroundPanel}
          paddingX={2}
          paddingY={1}
          width={88}
          maxHeight="80%"
        >
          {props.children}
        </box>
      </box>
    </Show>
  );
}
