import React, { useMemo, useState } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import { LeftBorder } from "./LeftBorder.js";
import { useAppInput } from "./useAppInput.js";
import { isPrintableTextInput } from "./mouse.js";

interface ConnectViewProps {
  theme: ThemeColors;
  settings: Settings;
  viewportHeight: number;
  contentWidth: number;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

const GATEWAYS = ["telegram"] as const;
type Gateway = (typeof GATEWAYS)[number];

function parseAllowedIds(value: string): number[] | null {
  if (!value.trim()) return [];
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const ids = parts.map((p) => Number.parseInt(p, 10));
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) return null;
  return ids;
}

function idsToInput(ids: number[] | undefined): string {
  return (ids ?? []).join(", ");
}

export function ConnectView({
  theme,
  settings,
  viewportHeight,
  contentWidth,
  onSave,
  onClose,
}: ConnectViewProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [botToken, setBotToken] = useState(settings.telegram?.botToken ?? "");
  const [allowedUserIds, setAllowedUserIds] = useState(idsToInput(settings.telegram?.allowedUserIds));
  const [cursorIndex, setCursorIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const gateway = GATEWAYS[gatewayIndex] as Gateway;
  const rows = useMemo(
    () => ["gateway", "botToken", "allowedUserIds", "save"] as const,
    [],
  );

  useAppInput(
    (input, key) => {
      if (key.escape) {
        onClose();
        return;
      }

      if (key.upArrow) {
        setCursorIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setCursorIndex((i) => Math.min(rows.length - 1, i + 1));
        return;
      }

      const currentRow = rows[cursorIndex];
      if (key.return) {
        if (currentRow === "gateway") {
          setGatewayIndex((i) => (i + 1) % GATEWAYS.length);
          setError(null);
          return;
        }
        if (currentRow === "save") {
          const parsedIds = parseAllowedIds(allowedUserIds);
          if (parsedIds === null) {
            setError("allowedUserIds must be comma-separated positive numbers.");
            return;
          }
          if (!botToken.trim()) {
            setError("botToken is required.");
            return;
          }
          const next: Settings = {
            ...settings,
            telegram: {
              ...settings.telegram,
              botToken: botToken.trim(),
              allowedUserIds: parsedIds,
            },
          };
          onSave(next);
          onClose();
        }
        return;
      }

      if (currentRow !== "botToken" && currentRow !== "allowedUserIds") return;

      if (key.backspace || key.delete) {
        if (currentRow === "botToken") {
          setBotToken((v) => v.slice(0, -1));
        } else {
          setAllowedUserIds((v) => v.slice(0, -1));
        }
        setError(null);
        return;
      }

      if (input && !key.ctrl && !key.meta && isPrintableTextInput(input)) {
        if (currentRow === "botToken") {
          setBotToken((v) => v + input);
        } else {
          setAllowedUserIds((v) => v + input);
        }
        setError(null);
      }
    },
    { isActive: true },
  );

  const tokenPreview = botToken.length > 0 ? `${"*".repeat(Math.max(6, botToken.length))}` : "";

  return (
    <Box
      flexDirection="column"
      height={viewportHeight}
      flexShrink={0}
      overflow="hidden"
      paddingX={2}
    >
      <LeftBorder theme={theme} borderColor={theme.primary}>
        <Text color={theme.text} bold>/connect</Text>
        <Text color={theme.textMuted}>Use arrow keys, type values, Enter save, Esc close</Text>

        <Box marginTop={1} flexDirection="column">
          <Text color={cursorIndex === 0 ? theme.primary : theme.text}>
            {cursorIndex === 0 ? ">" : " "} Gateway: <Text bold>{gateway}</Text>
            {cursorIndex === 0 ? <Text color={theme.textMuted}> (Enter to cycle)</Text> : null}
          </Text>
          <Text color={cursorIndex === 1 ? theme.primary : theme.text}>
            {cursorIndex === 1 ? ">" : " "} botToken:{" "}
            <Text color={botToken ? theme.text : theme.textMuted}>
              {tokenPreview || "Paste Telegram bot token"}
            </Text>
          </Text>
          <Text color={cursorIndex === 2 ? theme.primary : theme.text}>
            {cursorIndex === 2 ? ">" : " "} allowedUserIds:{" "}
            <Text color={allowedUserIds ? theme.text : theme.textMuted}>
              {allowedUserIds || "Example: 123456789, 987654321"}
            </Text>
          </Text>
          <Text color={cursorIndex === 3 ? theme.primary : theme.text}>
            {cursorIndex === 3 ? ">" : " "} Save to settings.json
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={theme.textMuted}>Stored under: telegram.botToken and telegram.allowedUserIds</Text>
          <Text color={theme.textMuted}>Future gateways can be added in this screen.</Text>
          {error ? <Text color={theme.error ?? "red"}>{error}</Text> : null}
        </Box>
      </LeftBorder>
    </Box>
  );
}
