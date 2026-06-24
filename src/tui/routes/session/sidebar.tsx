import { For, Show } from "solid-js";
import { useTheme } from "../../theme/provider.js";
import type { PlanTask } from "../../../agent/tools/plan.js";
import type { ContextUsageState } from "../../../agent/session.js";
import type { Settings } from "../../../config/settings.js";
import { formatTokenCount } from "../../../agent/compaction/tokens.js";
import { shortPath, SIDEBAR_WIDTH } from "../../utils/text.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getMcpConfigPath } from "../../../config/paths.js";

interface SidebarProps {
  workdir: string;
  sessionId: string;
  settings: Settings;
  planTasks: PlanTask[];
  skillsCount: number;
  contextUsage: ContextUsageState;
}

function countMcpServers(): number {
  const path = getMcpConfigPath();
  if (!existsSync(path)) return 0;
  try {
    const cfg = JSON.parse(readFileSync(path, "utf-8")) as { servers?: Record<string, unknown> };
    return Object.keys(cfg.servers ?? {}).length;
  } catch {
    return 0;
  }
}

function gitBranch(workdir: string): string | null {
  try {
    const head = join(workdir, ".git", "HEAD");
    if (!existsSync(head)) return null;
    const ref = readFileSync(head, "utf-8").trim();
    if (ref.startsWith("ref: ")) {
      return ref.slice(5).split("/").pop() ?? null;
    }
    return ref.slice(0, 7);
  } catch {
    return null;
  }
}

function taskMark(status: PlanTask["status"]): string {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "→";
  return "○";
}

export function Sidebar(props: SidebarProps) {
  const theme = useTheme();
  const branch = () => gitBranch(props.workdir);
  const mcpCount = () => countMcpServers();

  return (
    <box
      flexDirection="column"
      width={SIDEBAR_WIDTH}
      height="100%"
      borderStyle="single"
      border={["left"]}
      borderColor={theme.border}
      backgroundColor={theme.backgroundPanel}
      paddingX={1}
      paddingY={1}
    >
      <text fg={theme.text} attributes={1}>
        Session
      </text>
      <text fg={theme.textMuted}>{props.sessionId.slice(0, 8)}…</text>

      <box marginTop={1}>
        <text fg={theme.textMuted}>⌂ {shortPath(props.workdir, 36)}</text>
        <Show when={branch()}>
          <text fg={theme.primary}> ⎇ {branch()}</text>
        </Show>
      </box>

      <box marginTop={2}>
        <text fg={theme.text} attributes={1}>
          Plan
        </text>
        <Show
          when={props.planTasks.length > 0}
          fallback={<text fg={theme.textMuted}> No plan yet</text>}
        >
          <For each={props.planTasks.slice(0, 12)}>
            {(task) => (
              <text fg={task.status === "in_progress" ? theme.primary : theme.textMuted}>
                {taskMark(task.status)} {task.content.slice(0, 34)}
                {task.content.length > 34 ? "…" : ""}
              </text>
            )}
          </For>
        </Show>
      </box>

      <box marginTop={2} flexGrow={1}>
        <text fg={theme.textMuted}>
          MCP {mcpCount()} · Skills {props.skillsCount}
        </text>
        <Show when={props.contextUsage.tokens > 0}>
          <text fg={theme.textMuted}>
            ctx {formatTokenCount(props.contextUsage.tokens)}/
            {formatTokenCount(props.contextUsage.window)}
          </text>
        </Show>
      </box>

      <text fg={theme.textMuted}>agent-dev v0.4.0</text>
    </box>
  );
}
