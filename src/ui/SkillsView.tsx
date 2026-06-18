import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import type { ThemeColors } from "./theme.js";
import type { Settings } from "../config/settings.js";
import { discoverSkills, SKILLS_CATALOG_URL, SKILLS_DOCS_URL } from "../agent/skills.js";
import { openSkillsCatalog, runSkillsAdd } from "../cli/skills.js";
import { clamp } from "./scroll.js";
import { useMouseScroll } from "./useMouseScroll.js";
import { WHEEL_SCROLL_LINES } from "./mouse.js";
import { useAppInput } from "./useAppInput.js";
import { isPrintableTextInput } from "./mouse.js";
import { LeftBorder } from "./LeftBorder.js";

type Mode = "list" | "install";

interface SkillsViewProps {
  theme: ThemeColors;
  settings: Settings;
  workdir: string;
  viewportHeight: number;
  contentWidth: number;
  onClose: () => void;
}

function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

const HEADER_ROWS = 4;

export function SkillsView({
  theme,
  settings,
  workdir,
  viewportHeight,
  contentWidth,
  onClose,
}: SkillsViewProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [index, setIndex] = useState(0);
  const [listScroll, setListScroll] = useState(0);
  const [installSource, setInstallSource] = useState("");
  const [installGlobal, setInstallGlobal] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [installing, setInstalling] = useState(false);

  const skills = useMemo(
    () => discoverSkills(workdir, settings),
    [workdir, settings, refreshKey],
  );

  const listHeight = Math.max(4, viewportHeight - HEADER_ROWS - (status ? 1 : 0));
  const safeIndex = Math.min(index, Math.max(0, skills.length - 1));
  const maxListScroll = Math.max(0, skills.length - listHeight);

  useEffect(() => {
    setListScroll((prev) => {
      if (safeIndex < prev) return safeIndex;
      if (safeIndex >= prev + listHeight) return safeIndex - listHeight + 1;
      return clamp(prev, 0, maxListScroll);
    });
  }, [safeIndex, listHeight, maxListScroll]);

  const runInstall = useCallback(async () => {
    const source = installSource.trim();
    if (!source) {
      setStatus("Enter a source, e.g. vercel-labs/agent-skills");
      return;
    }
    setInstalling(true);
    setStatus(`Installing ${source}...`);
    const code = await runSkillsAdd(source, { global: installGlobal });
    setInstalling(false);
    if (code === 0) {
      setStatus(`Installed ${source}`);
      setRefreshKey((v) => v + 1);
      setMode("list");
      setInstallSource("");
    } else {
      setStatus(`Install failed (exit ${code})`);
    }
  }, [installSource, installGlobal]);

  useMouseScroll(
    (direction) => {
      if (mode !== "list" || skills.length === 0) return;
      const delta = direction === "up" ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES;
      setIndex((i) => Math.max(0, Math.min(skills.length - 1, i + delta)));
    },
    { isActive: mode === "list" },
  );

  useAppInput(
    (input, key) => {
      if (installing) return;

      if (mode === "list") {
        if (key.escape) {
          onClose();
          return;
        }
        if (input === "a" && !key.ctrl && !key.meta) {
          setMode("install");
          setStatus(undefined);
          return;
        }
        if (input === "o" && !key.ctrl && !key.meta) {
          openSkillsCatalog();
          setStatus(`Opened ${SKILLS_CATALOG_URL}`);
          return;
        }
        if (key.upArrow || key.pageUp) {
          setIndex((i) => Math.max(0, i - (key.pageUp ? 5 : 1)));
          return;
        }
        if (key.downArrow || key.pageDown) {
          setIndex((i) => Math.min(skills.length - 1, i + (key.pageDown ? 5 : 1)));
        }
        return;
      }

      if (mode === "install") {
        if (key.escape) {
          setMode("list");
          setStatus(undefined);
          return;
        }
        if (input === "o" && key.ctrl) {
          openSkillsCatalog();
          return;
        }
        if (input === "g" && key.ctrl) {
          setInstallGlobal((v) => !v);
          return;
        }
        if (key.return) {
          void runInstall();
          return;
        }
        if (key.backspace || key.delete) {
          setInstallSource((v) => v.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta && isPrintableTextInput(input)) {
          setInstallSource((v) => v + input);
        }
      }
    },
    { isActive: true },
  );

  if (mode === "install") {
    return (
      <Box flexDirection="column" height={viewportHeight} flexShrink={0} paddingX={2}>
        <LeftBorder theme={theme} borderColor={theme.borderActive}>
          <Text color={theme.text} bold>/skills · install</Text>
          <Text color={theme.textMuted}>
            Type owner/repo · Enter install · Ctrl+G scope · Ctrl+O catalog · Esc back
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={installGlobal ? theme.primary : theme.textMuted}>
              {installGlobal ? "◉" : "○"} Scope: {installGlobal ? "global (~/.config/agents/skills)" : "project (.agents/skills)"}
              <Text color={theme.textMuted}> · Ctrl+G toggle</Text>
            </Text>
            <Text color={theme.primary}>
              › {installSource}
              <Text color={theme.text}>▌</Text>
            </Text>
            <Text color={theme.textMuted}>Example: vercel-labs/agent-skills</Text>
            <Text color={theme.textMuted}>Browse: {SKILLS_CATALOG_URL} (Ctrl+O)</Text>
            <Text color={theme.textMuted}>Docs:  {SKILLS_DOCS_URL}</Text>
            {status && (
              <Box marginTop={1}>
                <Text color={theme.textMuted}>{status}</Text>
              </Box>
            )}
          </Box>
        </LeftBorder>
      </Box>
    );
  }

  const visible = skills.slice(listScroll, listScroll + listHeight);
  const nameWidth = Math.max(18, Math.floor(contentWidth * 0.35));

  return (
    <Box flexDirection="column" height={viewportHeight} flexShrink={0} paddingX={2}>
      <Text color={theme.text} bold>/skills</Text>
      <Text color={theme.textMuted}>
        ↑↓ move · a install · o open {SKILLS_CATALOG_URL} · Esc close
        {skills.length > 0 && (
          <>
            {" "}
            · {safeIndex + 1}/{skills.length}
          </>
        )}
      </Text>
      <Text color={theme.textMuted}>Catalog: {SKILLS_CATALOG_URL}</Text>

      <Box flexDirection="column" marginTop={1} height={listHeight} overflow="hidden">
        {skills.length === 0 && (
          <Box flexDirection="column">
            <Text color={theme.textMuted}>No skills installed. Press a to install, o to browse catalog.</Text>
            <Text color={theme.textMuted}>Popular: vercel-labs/agent-skills</Text>
            <Text color={theme.textMuted}>Docs: {SKILLS_DOCS_URL}</Text>
          </Box>
        )}
        {visible.map((skill, row) => {
          const i = listScroll + row;
          const selected = i === safeIndex;
          return (
            <Text key={skill.location} color={selected ? theme.primary : theme.text}>
              {selected ? "› " : "  "}
              {truncate(skill.name, nameWidth).padEnd(nameWidth)}
              <Text color={theme.textMuted}>
                {truncate(skill.description ?? "(no description)", contentWidth - nameWidth - 4)}
              </Text>
            </Text>
          );
        })}
      </Box>

      {status && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>{status}</Text>
        </Box>
      )}
    </Box>
  );
}
