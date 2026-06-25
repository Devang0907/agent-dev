import { Show, onMount } from "solid-js";
import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { ThemeProvider } from "./theme/provider.js";
import { HomeRoute } from "./routes/home.js";
import { SessionRoute } from "./routes/session/index.js";
import { Dialogs } from "./dialogs/index.js";
import { CommandPalette } from "./components/command-palette.js";
import { createSessionBridge, type SessionBridge } from "./session-bridge.js";
import type { AgentSession } from "../agent/session.js";
import { buildCommandRegistry } from "./commands/registry.js";
import { installKeyRouter, setChromeKeyHandler } from "./utils/keys.js";

export interface TuiAppProps {
  session: AgentSession;
  workdir: string;
  initialPrompt?: string;
}

function TuiRoot(props: {
  bridge: SessionBridge;
  renderer: CliRenderer;
  onQuit: () => void;
}) {
  const route = () => props.bridge.state().route;
  const dialog = () => props.bridge.state().dialog;

  const submit = (value: string) => {
    void props.bridge.submitPrompt(value, props.onQuit);
  };

  const commands = () =>
    buildCommandRegistry({
      onSlash: (cmd) => void props.bridge.submitPrompt(cmd, props.onQuit),
      onPaletteAction: (id) => {
        if (id === "scroll-latest") {
          props.bridge.scrollToLatest();
        }
        if (id === "interrupt" && props.bridge.state().running) {
          props.bridge.session.abort();
        }
      },
      skills: props.bridge.state().skillOptions,
    });

  onMount(() => {
    installKeyRouter(props.renderer);
    setChromeKeyHandler((key) => {
      if (key.ctrl && key.sequence === "p") {
        props.bridge.patch({ dialog: dialog() === "palette" ? "none" : "palette" });
        key.preventDefault();
        return;
      }
      if (key.name === "escape" && props.bridge.state().running) {
        props.bridge.session.abort();
        key.preventDefault();
      }
    });
  });

  return (
    <ThemeProvider>
      <box width="100%" height="100%" minHeight={0}>
        <Show when={route() === "home"}>
          <HomeRoute bridge={props.bridge} renderer={props.renderer} onSubmit={submit} onQuit={props.onQuit} />
        </Show>
        <Show when={route() === "session"}>
          <SessionRoute bridge={props.bridge} renderer={props.renderer} onSubmit={submit} />
        </Show>
        <Dialogs bridge={props.bridge} renderer={props.renderer} />
        <CommandPalette
          open={dialog() === "palette"}
          commands={commands()}
          onRun={(entry) => {
            entry.run();
            props.bridge.patch({ dialog: "none" });
          }}
          onClose={() => props.bridge.patch({ dialog: "none" })}
        />
      </box>
    </ThemeProvider>
  );
}

export async function runTui(props: TuiAppProps): Promise<void> {
  let renderer: CliRenderer;
  try {
    renderer = await createCliRenderer({
      useMouse: true,
      targetFps: 60,
      gatherStats: false,
      exitOnCtrlC: true,
    });
  } catch (err) {
    throw new Error(`OpenTUI renderer failed to start: ${err instanceof Error ? err.message : err}`);
  }

  installKeyRouter(renderer);

  const bridge = createSessionBridge(props.session, props.workdir);
  const { render } = await import("@opentui/solid");

  const done = new Promise<void>((resolve) => {
    renderer.once("destroy", () => resolve());
  });

  let quitting = false;
  const quit = () => {
    if (quitting) return;
    quitting = true;
    renderer.destroy();
  };

  try {
    await render(() => <TuiRoot bridge={bridge} renderer={renderer} onQuit={quit} />, renderer);
  } catch (err) {
    renderer.destroy();
    throw new Error(`OpenTUI render failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!renderer.isRunning) {
    renderer.start();
  }

  if (props.initialPrompt) {
    setTimeout(() => void bridge.submitPrompt(props.initialPrompt!, quit), 150);
  }

  await done;
}
