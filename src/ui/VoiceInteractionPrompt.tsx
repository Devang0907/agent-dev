import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ThemeColors } from "./theme.js";
import type { InteractionRequest } from "../agent/loop.js";
import type { Settings } from "../config/settings.js";
import { listenForVoice } from "../voice/listen.js";
import { VoiceError } from "../voice/types.js";
import { LeftBorder } from "./LeftBorder.js";
import { SPINNER_FRAMES } from "./theme.js";

interface VoiceInteractionPromptProps {
  theme: ThemeColors;
  request: InteractionRequest;
  settings: Settings;
  onContinue: (value?: string) => void;
}

export function VoiceInteractionPrompt({
  theme,
  request,
  settings,
  onContinue,
}: VoiceInteractionPromptProps) {
  const [phase, setPhase] = useState<"listening" | "transcribing" | "error">("listening");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [spinIdx, setSpinIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const text = await listenForVoice(settings, {
          signal: controller.signal,
          onStateChange: (state) => setPhase(state),
        });
        if (finishedRef.current) return;
        finishedRef.current = true;
        onContinue(text);
      } catch (err) {
        if (finishedRef.current || controller.signal.aborted) {
          if (!finishedRef.current) {
            finishedRef.current = true;
            onContinue();
          }
          return;
        }
        const message =
          err instanceof VoiceError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Voice input failed";
        setPhase("error");
        setErrorMessage(message);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [settings, onContinue]);

  useInput(
    (_, key) => {
      if (key.escape) {
        abortRef.current?.abort();
        if (!finishedRef.current) {
          finishedRef.current = true;
          onContinue();
        }
      }
      if (key.return && phase === "error") {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onContinue();
        }
      }
    },
    { isActive: true },
  );

  const status =
    phase === "transcribing"
      ? "Transcribing…"
      : phase === "error"
        ? (errorMessage ?? "Voice input failed")
        : "Listening… speak now";

  return (
    <Box flexDirection="column" marginX={2} marginTop={1} marginBottom={1}>
      <LeftBorder theme={theme} borderColor={theme.primary}>
        <Text color={theme.text} bold>
          Voice input
        </Text>
        <Text color={theme.textMuted}>Esc cancel · agent is waiting for speech</Text>
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={theme.primary}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.text}>{request.reason}</Text>
          <Box marginTop={1}>
            <Text color={phase === "error" ? theme.warning : theme.primary}>
              {phase !== "error" ? `${SPINNER_FRAMES[spinIdx]} ` : ""}
              {status}
            </Text>
          </Box>
        </Box>
      </LeftBorder>
    </Box>
  );
}
