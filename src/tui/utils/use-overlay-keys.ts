import { onCleanup, onMount } from "solid-js";
import { setOverlayKeyHandler, type KeyHandler } from "./keys.js";

export function useOverlayKeys(handler: KeyHandler): void {
  onMount(() => {
    setOverlayKeyHandler(handler);
    onCleanup(() => setOverlayKeyHandler(null));
  });
}
