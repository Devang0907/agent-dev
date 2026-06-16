import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { AgentSession, SessionEvent } from "../agent/session.js";
import { ChatView } from "./ChatView.js";
import { Editor } from "./Editor.js";
import { Footer } from "./Footer.js";
import { ModelSelector } from "./ModelSelector.js";
import { SettingsView } from "./SettingsView.js";
import { getTheme } from "./theme.js";
import { saveSettings } from "../config/settings.js";

export interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

type Overlay = "none" | "model" | "settings";

interface AppProps {
  session: AgentSession;
  workdir: string;
  onQuit: () => void;
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
  const [settings, setSettings] = useState(session.getSettings());
  const [model, setModel] = useState(session.getModel());
  const [running, setRunning] = useState(false);
  const streamingRef = useRef("");

  const theme = getTheme(settings.theme);

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
  }, [session]);

  useInput((_, key) => {
    if (overlay !== "none") return;
    if (key.escape && running) {
      session.abort();
    }
  });

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
      await session.prompt(value);
    },
    [session, running, onQuit, exit],
  );

  return (
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}>
        <Text color={theme.header} bold>agent-dev</Text>
        <Text color={theme.muted}> — /model /settings /new /quit | Esc abort</Text>
      </Box>

      <ChatView messages={displayMessages} theme={theme} streamingText={streamingText} />

      <Footer workdir={workdir} model={model} theme={theme} running={running} />

      {overlay === "none" && (
        <Editor theme={theme} disabled={running} onSubmit={handleSubmit} />
      )}

      {overlay === "model" && (
        <ModelSelector
          theme={theme}
          settings={settings}
          filter={modelFilter}
          onSelect={(m) => {
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

      {overlay === "settings" && (
        <SettingsView
          theme={theme}
          settings={settings}
          onUpdate={(s) => {
            session.updateSettings(s);
            setSettings(s);
            saveSettings(s);
          }}
          onClose={() => setOverlay("none")}
        />
      )}
    </Box>
  );
}
