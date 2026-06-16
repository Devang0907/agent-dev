import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, useInput, useApp } from "ink";
import type { AgentSession, SessionEvent } from "../agent/session.js";
import { ChatView } from "./ChatView.js";
import { Editor } from "./Editor.js";
import { Footer } from "./Footer.js";
import { ModelSelector } from "./ModelSelector.js";
import { ApiKeyPrompt } from "./ApiKeyPrompt.js";
import { SettingsView } from "./SettingsView.js";
import { hasProviderAuth, getDefaultModelForProvider } from "../providers/registry.js";
import type { Model, ProviderId } from "../providers/types.js";
import { findModel } from "../config/models.js";
import type { Settings } from "../config/settings.js";
import { StartupBanner } from "./StartupBanner.js";
import { getTheme } from "./theme.js";

export interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

type Overlay = "none" | "model" | "settings" | "apiKey";

interface AppProps {
  session: AgentSession;
  workdir: string;
  onQuit: () => void;
}

function modelForProvider(provider: ProviderId, settings: Settings): Model {
  const current = findModel(settings.defaultProvider, settings.defaultModel);
  if (current?.provider === provider) return current;
  return getDefaultModelForProvider(provider)!;
}

export function App({ session, workdir, onQuit }: AppProps) {
  const { exit } = useApp();
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() =>
    session.getMessages().map((m) => ({
      role: m.role === "tool" ? "tool" : m.role === "user" ? "user" : "assistant",
      content: m.content,
      toolName: m.name,
    })),
  );
  const [streamingText, setStreamingText] = useState("");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [modelFilter, setModelFilter] = useState<string | undefined>();
  const [pendingModel, setPendingModel] = useState<Model | null>(null);
  const [apiKeyReturnOverlay, setApiKeyReturnOverlay] = useState<Overlay>("none");
  const [settings, setSettings] = useState(session.getSettings());
  const [model, setModel] = useState(session.getModel());
  const [running, setRunning] = useState(false);
  const streamingRef = useRef("");
  const startupChecked = useRef(false);

  const theme = getTheme();

  const openApiKeyPrompt = useCallback(
    (target: Model, returnTo: Overlay = "none") => {
      setPendingModel(target);
      setApiKeyReturnOverlay(returnTo);
      setOverlay("apiKey");
    },
    [],
  );

  const saveApiKey = useCallback(
    (apiKey: string) => {
      if (!pendingModel) return;
      const updated = {
        ...settings,
        apiKeys: { ...settings.apiKeys, [pendingModel.provider]: apiKey },
      };
      session.updateSettings(updated);
      setSettings(updated);
      session.setModel(pendingModel);
      setModel(pendingModel);
      setPendingModel(null);
      setOverlay(apiKeyReturnOverlay);
      setApiKeyReturnOverlay("none");
      setModelFilter(undefined);
    },
    [pendingModel, settings, session, apiKeyReturnOverlay],
  );

  useEffect(() => {
    if (startupChecked.current) return;
    startupChecked.current = true;
    const current = session.getModel();
    if (!hasProviderAuth(current.provider, settings)) {
      openApiKeyPrompt(current, "none");
    }
  }, [session, settings, openApiKeyPrompt]);

  useEffect(() => {
    const handler = (event: SessionEvent) => {
      switch (event.type) {
        case "user_message":
          setDisplayMessages((prev) => [...prev, { role: "user", content: event.content }]);
          setRunning(true);
          streamingRef.current = "";
          setStreamingText("");
          break;
        case "message_start":
          streamingRef.current = "";
          setStreamingText("");
          break;
        case "text_delta":
          streamingRef.current += event.delta;
          setStreamingText(streamingRef.current);
          break;
        case "tool_call":
          const partial = streamingRef.current;
          if (partial) {
            setDisplayMessages((prev) => [...prev, { role: "assistant", content: partial }]);
            streamingRef.current = "";
            setStreamingText("");
          }
          break;
        case "tool_result":
          setDisplayMessages((prev) => [
            ...prev,
            { role: "tool", content: event.result, toolName: event.name },
          ]);
          break;
        case "turn_end":
          const final = streamingRef.current;
          if (final) {
            setDisplayMessages((prev) => [...prev, { role: "assistant", content: final }]);
          }
          streamingRef.current = "";
          setStreamingText("");
          setRunning(false);
          break;
        case "error":
          setDisplayMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${event.message}` },
          ]);
          streamingRef.current = "";
          setStreamingText("");
          setRunning(false);
          if (/Missing .*API_KEY/i.test(event.message)) {
            openApiKeyPrompt(model, "none");
          }
          break;
        case "model_changed":
          setModel(event.model);
          break;
      }
    };
    session.on("event", handler);
    return () => {
      session.off("event", handler);
    };
  }, [session, model, openApiKeyPrompt]);

  useInput(
    (_, key) => {
      if (overlay !== "none") return;
      if (key.escape && running) {
        session.abort();
      }
    },
    { isActive: overlay === "none" },
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (value === "/quit") {
        onQuit();
        exit();
        return;
      }
      if (value === "/new") {
        session.newSession();
        setDisplayMessages([]);
        setStreamingText("");
        return;
      }
      if (value === "/settings") {
        setOverlay("settings");
        return;
      }
      if (value.startsWith("/model")) {
        const parts = value.split(/\s+/);
        setModelFilter(parts[1] ?? undefined);
        setOverlay("model");
        return;
      }
      if (running) return;

      if (!hasProviderAuth(model.provider, settings)) {
        openApiKeyPrompt(model, "none");
        return;
      }

      await session.prompt(value);
    },
    [session, running, onQuit, exit, model, settings, openApiKeyPrompt],
  );

  const hasChat = displayMessages.length > 0 || streamingText.length > 0;

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={2} marginBottom={1}>
        <StartupBanner theme={theme} compact={hasChat} />
      </Box>

      <ChatView
        messages={displayMessages}
        theme={theme}
        model={model}
        streamingText={streamingText}
        running={running}
      />

      <Footer workdir={workdir} model={model} theme={theme} />

      {overlay === "none" && (
        <Editor
          theme={theme}
          model={model}
          disabled={running}
          running={running}
          onSubmit={handleSubmit}
        />
      )}

      {overlay === "model" && (
        <ModelSelector
          theme={theme}
          settings={settings}
          filter={modelFilter}
          onSelect={(m) => {
            if (!hasProviderAuth(m.provider, settings)) {
              openApiKeyPrompt(m, "model");
              return;
            }
            session.setModel(m);
            setModel(m);
            setOverlay("none");
            setModelFilter(undefined);
          }}
          onClose={() => {
            setOverlay("none");
            setModelFilter(undefined);
          }}
        />
      )}

      {overlay === "apiKey" && pendingModel && (
        <ApiKeyPrompt
          theme={theme}
          provider={pendingModel.provider}
          model={pendingModel}
          onSubmit={saveApiKey}
          onCancel={() => {
            setPendingModel(null);
            setOverlay(apiKeyReturnOverlay);
            setApiKeyReturnOverlay("none");
          }}
        />
      )}

      {overlay === "settings" && (
        <SettingsView
          theme={theme}
          settings={settings}
          onUpdate={(s) => {
            session.updateSettings(s);
            setSettings(s);
          }}
          onSetApiKey={(provider) => {
            openApiKeyPrompt(modelForProvider(provider, settings), "settings");
          }}
          onClose={() => setOverlay("none")}
        />
      )}
    </Box>
  );
}
