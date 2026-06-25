import { Show } from "solid-js";
import type { CliRenderer, InputRenderable } from "@opentui/core";
import { DialogOverlay } from "../ui/dialog.js";
import { DialogSelect, type DialogSelectItem } from "../ui/dialog-select.js";
import type { SessionBridge } from "../session-bridge.js";
import { ALL_MODELS, modelRef, PROVIDER_LABELS } from "../../config/models.js";
import { hasProviderAuth } from "../../providers/registry.js";
import { SessionManager } from "../../session/manager.js";
import type { Model } from "../../providers/types.js";
import type { ProviderId } from "../../providers/types.js";
import { getCompactionSettings, DEFAULT_COMPACTION_SETTINGS } from "../../config/settings.js";
import type { ThinkingLevel } from "../../providers/types.js";
import { discoverSkills } from "../../agent/skills.js";
import { createSignal, onMount } from "solid-js";
import { useTheme } from "../theme/provider.js";
import { PROVIDER_ENV_VARS } from "../../providers/registry.js";
import { useOverlayKeys } from "../utils/use-overlay-keys.js";

interface DialogsProps {
  bridge: SessionBridge;
  renderer: CliRenderer;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export function Dialogs(props: DialogsProps) {
  const s = () => props.bridge.state();
  const dialog = () => s().dialog;

  const modelItems = (): DialogSelectItem[] => {
    const filter = s().modelFilter;
    return ALL_MODELS.filter((m) => {
      const label = `${PROVIDER_LABELS[m.provider]} ${m.name} ${modelRef(m)}`;
      return fuzzyMatch(label, filter ?? "");
    }).map((m) => ({
      id: modelRef(m),
      title: m.name,
      subtitle: modelRef(m),
      marker: hasProviderAuth(m.provider, s().settings) ? "●" : "○",
    }));
  };

  const sessionItems = (): DialogSelectItem[] =>
    SessionManager.listSessions().map((sess) => ({
      id: sess.sessionId,
      title: sess.title || sess.sessionId.slice(0, 8),
      subtitle: sess.sessionId === s().currentSessionId ? "current" : undefined,
    }));

  const settingsItems = (): DialogSelectItem[] => {
    const compaction = getCompactionSettings(s().settings);
    const providers: ProviderId[] = ["openai", "anthropic", "groq", "gemini", "free"];
    return [
      {
        id: "thinking",
        title: `Thinking: ${s().settings.thinkingLevel}`,
        subtitle: "Enter to cycle",
      },
      {
        id: "compaction",
        title: `Auto-compact: ${compaction.enabled ? "on" : "off"}`,
        subtitle: "Enter to toggle",
      },
      ...providers.map((p) => ({
        id: `apikey-${p}`,
        title: PROVIDER_LABELS[p],
        subtitle: hasProviderAuth(p, s().settings) ? "configured" : "Enter to set API key",
        marker: hasProviderAuth(p, s().settings) ? "●" : "○",
      })),
    ];
  };

  const skillItems = (): DialogSelectItem[] =>
    discoverSkills(props.bridge.workdir, s().settings).map((sk) => ({
      id: sk.name,
      title: sk.name,
      subtitle: sk.description?.slice(0, 48),
    }));

  const selectModel = (item: DialogSelectItem) => {
    const m = ALL_MODELS.find((x) => modelRef(x) === item.id);
    if (!m) return;
    if (!hasProviderAuth(m.provider, s().settings)) {
      props.bridge.openApiKeyPrompt(m, "model");
      return;
    }
    props.bridge.session.setModel(m);
    props.bridge.patch({ model: m, dialog: "none", modelFilter: undefined });
  };

  const THINKING: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

  const selectSettings = (item: DialogSelectItem) => {
    const settings = s().settings;
    if (item.id === "thinking") {
      const cur = THINKING.indexOf(settings.thinkingLevel);
      const next = THINKING[(cur + 1) % THINKING.length]!;
      const updated = { ...settings, thinkingLevel: next };
      props.bridge.session.updateSettings(updated);
      props.bridge.patch({ settings: updated });
      return;
    }
    if (item.id === "compaction") {
      const compaction = getCompactionSettings(settings);
      const updated = {
        ...settings,
        compaction: {
          ...compaction,
          enabled: !(compaction.enabled ?? DEFAULT_COMPACTION_SETTINGS.enabled),
        },
      };
      props.bridge.session.updateSettings(updated);
      props.bridge.patch({ settings: updated });
      return;
    }
    if (item.id.startsWith("apikey-")) {
      const provider = item.id.slice(7) as ProviderId;
      props.bridge.openApiKeyPrompt(props.bridge.modelForProvider(provider, settings), "settings");
    }
  };

  return (
    <>
      <Show when={dialog() === "model"}>
        <DialogOverlay open onClose={() => props.bridge.patch({ dialog: "none", modelFilter: undefined })}>
          <DialogSelect
            title="/model"
            items={modelItems()}
            filter={s().modelFilter}
            hint="● configured · ○ needs API key"
            onSelect={selectModel}
            onClose={() => props.bridge.patch({ dialog: "none", modelFilter: undefined })}
          />
        </DialogOverlay>
      </Show>

      <Show when={dialog() === "sessions"}>
        <DialogOverlay open onClose={() => props.bridge.patch({ dialog: "none" })}>
          <DialogSelect
            title="/sessions"
            items={sessionItems()}
            onSelect={(item) => {
              const sess = SessionManager.listSessions().find((x) => x.sessionId === item.id);
              if (sess) props.bridge.loadSession(sess);
            }}
            onClose={() => props.bridge.patch({ dialog: "none" })}
          />
        </DialogOverlay>
      </Show>

      <Show when={dialog() === "settings"}>
        <DialogOverlay open onClose={() => props.bridge.patch({ dialog: "none" })}>
          <DialogSelect
            title="/settings"
            items={settingsItems()}
            onSelect={selectSettings}
            onClose={() => props.bridge.patch({ dialog: "none" })}
          />
        </DialogOverlay>
      </Show>

      <Show when={dialog() === "skills"}>
        <DialogOverlay open onClose={() => props.bridge.patch({ dialog: "none" })}>
          <DialogSelect
            title="/skills"
            items={skillItems()}
            hint="Run: agent skills add <owner/repo>"
            onSelect={() => props.bridge.patch({ dialog: "none" })}
            onClose={() => props.bridge.patch({ dialog: "none" })}
          />
        </DialogOverlay>
      </Show>

      <Show when={dialog() === "connect"}>
        <ConnectDialog bridge={props.bridge} renderer={props.renderer} />
      </Show>

      <Show when={dialog() === "apiKey" && s().pendingModel}>
        <ApiKeyDialog bridge={props.bridge} renderer={props.renderer} />
      </Show>
    </>
  );
}

function ApiKeyDialog(props: { bridge: SessionBridge; renderer: CliRenderer }) {
  const theme = useTheme();
  let inputRef: InputRenderable | undefined;
  const [value, setValue] = createSignal("");
  const model = () => props.bridge.state().pendingModel!;

  const close = () =>
    props.bridge.patch({
      pendingModel: null,
      dialog: props.bridge.state().apiKeyReturnDialog,
      apiKeyReturnDialog: "none",
    });

  const readInput = () => inputRef?.plainText ?? value();

  const saveKey = (raw?: string) => {
    const key = (raw ?? readInput()).trim();
    if (key) props.bridge.saveApiKey(key);
  };

  useOverlayKeys((key) => {
    if (key.name === "escape") {
      close();
      key.preventDefault();
      return;
    }
    if ((key.name === "return" || key.name === "kpenter") && !key.shift) {
      const current = readInput().trim();
      if (current) {
        saveKey(current);
        key.preventDefault();
      }
    }
  });

  onMount(() => () => {
    if (inputRef && !inputRef.isDestroyed) inputRef.blur();
  });

  const envVars = () => PROVIDER_ENV_VARS[model().provider];

  return (
    <DialogOverlay open onClose={close}>
      <box flexDirection="column" width={72}>
        <text fg={theme.text} attributes={1}>
          API key for {PROVIDER_LABELS[model().provider]}
        </text>
        <text fg={theme.textMuted}>model: {modelRef(model())}</text>
        <text fg={theme.textMuted}>env: {envVars().join(" or ")}</text>
        <box marginTop={1} borderStyle="rounded" borderColor={theme.primary} paddingX={1} paddingY={0}>
          <input
            ref={(el) => {
              inputRef = el;
            }}
            focused
            placeholder="paste key…"
            value={value()}
            onInput={setValue}
            onChange={setValue}
            onSubmit={() => saveKey()}
          />
        </box>
        <text fg={theme.textMuted} marginTop={1}>
          Type or paste key · Enter save · Esc cancel
        </text>
      </box>
    </DialogOverlay>
  );
}

function ConnectDialog(props: { bridge: SessionBridge; renderer: CliRenderer }) {
  const theme = useTheme();
  const [token, setToken] = createSignal(props.bridge.state().settings.telegram?.botToken ?? "");
  const [ids, setIds] = createSignal(
    (props.bridge.state().settings.telegram?.allowedUserIds ?? []).join(", "),
  );

  useOverlayKeys((key) => {
    if (key.name === "escape") {
      props.bridge.patch({ dialog: "none" });
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.sequence === "s") {
      const parsed = ids()
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => Number.parseInt(p, 10));
      if (parsed.some((id) => !Number.isFinite(id))) return;
      const updated = {
        ...props.bridge.state().settings,
        telegram: {
          botToken: token().trim() || undefined,
          allowedUserIds: parsed.length > 0 ? parsed : undefined,
        },
      };
      props.bridge.session.updateSettings(updated);
      props.bridge.patch({ settings: updated, dialog: "none" });
      key.preventDefault();
    }
  });

  return (
    <DialogOverlay open onClose={() => props.bridge.patch({ dialog: "none" })}>
      <box flexDirection="column" width={80}>
        <text fg={theme.text} attributes={1}>
          /connect — Telegram
        </text>
        <text fg={theme.textMuted}>Ctrl+S save · Esc close</text>
        <text fg={theme.text} marginTop={1}>
          Bot token:
        </text>
        <input
          focused
          value={token()}
          onInput={setToken}
          placeholder="123456:ABC..."
        />
        <text fg={theme.text} marginTop={1}>
          Allowed user IDs (comma-separated):
        </text>
        <input value={ids()} onInput={setIds} placeholder="12345, 67890" />
      </box>
    </DialogOverlay>
  );
}
