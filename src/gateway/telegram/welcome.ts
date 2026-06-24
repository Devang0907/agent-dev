export function formatWelcomeMessage(options: {
  workdir: string;
  modelRef?: string;
  agentMode?: string;
  boss?: boolean;
}): string {
  const modeLine = options.boss
    ? `${options.agentMode ?? "build"} · BOSS`
    : (options.agentMode ?? "build");

  return [
    "Welcome to agent-dev",
    "",
    "You are connected to your coding agent on this PC.",
    "",
    `Project: ${options.workdir}`,
    options.modelRef ? `Model: ${options.modelRef}` : undefined,
    `Mode: ${modeLine}`,
    "",
    "What the agent can do:",
    "- Read, edit, and search code in the project",
    "- Run git and shell commands (you approve via Approve/Deny buttons)",
    "- Web search, planning, skills, and MCP tools",
    "- Reminders and daily tasks (e.g. remind me in 5 min, news every morning)",
    "",
    "Commands:",
    "/build — full access (edit files, run shell)",
    "/plan — read-only exploration",
    "/boss — toggle boss orchestrator",
    "/mode — show or change mode",
    "/model — list or switch model (e.g. /model anthropic/claude-sonnet-4-6)",
    "/status — model, workdir, session, busy/idle",
    "/compact — summarize older messages to free context",
    "/new — start a fresh session",
    "/stop — abort the current turn",
    "/schedules — list active reminders and daily tasks",
    "/help — show this guide again",
    "",
    "Send any message to chat with the agent.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
