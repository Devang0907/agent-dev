# agent-dev

A minimal terminal coding agent with an Ink TUI. Chat with an AI that can read and edit code, search the web, run git/shell commands (with approval), use MCP servers, load skills, schedule Telegram reminders and daily tasks, and optionally delegate work through a **boss orchestrator** that coordinates specialized worker agents.

## Quick start

**From source:**

```bash
git clone https://github.com/Devang0907/agent-dev.git
cd agent-dev
npm install
npm run dev
```

**Global install (npm):**

```bash
npm install -g @devang0907/agent-dev
agent
```

Set at least one API key:

```bash
export OPENROUTER_API_KEY=sk-or-...   # Free models (default)
export OPENAI_API_KEY=sk-...          # ChatGPT
export ANTHROPIC_API_KEY=sk-ant-...   # Claude
export GROQ_API_KEY=gsk_...           # Groq
export GEMINI_API_KEY=...             # Google Gemini
```

Requires **Node.js 20+**.

## Providers

| Provider | Env var | Example models |
|----------|---------|----------------|
| OpenAI (ChatGPT) | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4.1`, `o4-mini` |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-haiku-4-5-20251001` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| Google Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.5-pro`, `gemini-2.5-flash` |
| Free (OpenRouter) | `OPENROUTER_API_KEY` | See [free models](#free-models-openrouter) below |

Model refs use `provider/model-id`, e.g. `anthropic/claude-sonnet-4-6`, `openai/gpt-4.1`, or `free/openrouter/free`.

### Free models (OpenRouter)

Free models use the `:free` suffix on OpenRouter. Availability changes often — agent-dev migrates retired slugs and retries fallbacks automatically. If a model fails, use **`/model openrouter/free`** (auto-picks a working free model).

| Model | Slug |
|-------|------|
| Free auto (recommended) | `openrouter/free` |
| Llama 3.3 70B (free) | `meta-llama/llama-3.3-70b-instruct:free` |
| Qwen3 Coder (free) | `qwen/qwen3-coder:free` |
| Qwen3 Next 80B (free) | `qwen/qwen3-next-80b-a3b-instruct:free` |
| GPT-OSS 120B (free) | `openai/gpt-oss-120b:free` |
| Gemma 4 26B (free) | `google/gemma-4-26b-a4b-it:free` |

Retired slugs like `deepseek/deepseek-r1:free` and `qwen/qwen3-235b-a22b:free` are remapped automatically on load.

Default provider/model: `free/meta-llama/llama-3.3-70b-instruct:free`.

## CLI

```bash
npm run dev                                    # Interactive TUI
npm run dev -- -p "List files in src"          # Print mode (no TUI)
npm run dev -- --boss                          # Start in boss orchestrator mode
npm run dev -- --boss -p "refactor auth module" # Boss mode, print and exit
npm run dev -- -c                              # Continue last session
npm run dev -- --model groq/llama-3.3-70b-versatile "hello"
npm run build && npm start                     # Production build
```

| Flag | Description |
|------|-------------|
| `-p`, `--print` | Print response and exit |
| `-c`, `--continue` | Resume the most recent session |
| `--boss` | Enable boss orchestrator mode |
| `--model <ref>` | Provider/model (e.g. `openai/gpt-4o`) |
| `-h`, `--help` | Show help |

**Skills subcommand:**

```bash
agent skills add vercel-labs/agent-skills
agent skills add vercel-labs/agent-skills -g    # global
agent skills find react
agent skills list
```

## Telegram gateway

Chat with agent-dev from your phone via Telegram (OpenClaw-style). The gateway runs on your PC, uses long-polling (no public URL or port forwarding), and forwards DMs to the agent. Shell/git/exec approvals arrive as **Approve / Deny** inline buttons. You can also set **reminders** and **daily tasks** (e.g. morning news) that fire while the gateway is running.

On first connect, send `/start` (or any message) to receive a welcome guide with available commands and capabilities.

### Setup

1. **Create a bot** — open [@BotFather](https://t.me/BotFather) in Telegram, run `/newbot`, save the token.

2. **Configure** — use `/connect` in the TUI (recommended), or add to `~/.agent-dev/settings.json` manually:

```json
{
  "telegram": {
    "botToken": "123456789:ABCdef...",
    "allowedUserIds": [987654321],
    "workdir": "D:/projects/MyRepo"
  }
}
```

Or use environment variables:

```bash
export TELEGRAM_BOT_TOKEN=123456789:ABCdef...
export TELEGRAM_ALLOWED_USER_IDS=987654321
```

**TUI setup (`/connect`):** in the interactive agent, run `/connect` to open the gateway setup screen. Choose **Telegram**, paste your `botToken`, enter `allowedUserIds` as comma-separated numbers (e.g. `123456789`), then save. Values are written to `telegram.botToken` and `telegram.allowedUserIds` in `~/.agent-dev/settings.json`. More gateways can be added here later.

3. **Find your Telegram user ID** — start the gateway, DM your bot, send `/whoami`. If the allowlist is empty, check the gateway console logs for `Rejected message from user <id>`.

4. **Add your ID** to `allowedUserIds`, then restart the gateway.

### Run

```bash
npm run dev -- telegram --workdir D:/projects/MyRepo
# or after build:
agent telegram --workdir D:/projects/MyRepo
agent telegram --boss --verbose
```

Keep the process running while you use the bot. While the gateway runs, the terminal shows a live log of Telegram activity:

```
[user] (123456789) list files in src
[agent] Here are the files in src/...
[tool] Running: grep pattern
[approval] npm test
[approval] Approved
```

On Windows, run it in a dedicated terminal, or use Task Scheduler / [pm2](https://pm2.keymetrics.io/) to keep it alive on login.

### Telegram commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome guide — commands, tools, project path (first connect) |
| `/help` | Show the welcome guide again |
| `/whoami` | Show your numeric Telegram user ID |
| `/new` | Start a new agent session |
| `/status` | Model, workdir, session id, busy/idle |
| `/stop` | Abort the current turn |
| `/build` | Switch to Build mode (edit files, run shell) |
| `/plan` | Switch to Plan mode (read-only exploration) |
| `/boss` | Toggle boss orchestrator mode |
| `/boss on` / `/boss off` | Enable or disable boss mode |
| `/mode` | Show current mode and available options |
| `/model` | List available models |
| `/model <provider/id>` | Switch model (e.g. `/model groq/llama-3.3-70b-versatile`) |
| `/schedules` | List active reminders and daily tasks for this chat |

### Reminders and scheduled tasks

While the Telegram gateway is running, you can ask the agent to remind you later or run recurring tasks (e.g. morning news). The agent uses the built-in **`schedule`** tool; a background scheduler checks every 30 seconds and delivers due items to your chat.

**One-shot reminders** — simple notifications at a relative or absolute time:

```
Remind me to drink water in 5 minutes
Remind me to call mom in 2 hours
```

**Daily recurring tasks** — the agent runs your instruction each day (uses `web_search` for news, etc.):

```
Send me the top news headlines every morning at 8:00
Give me a daily weather summary at 7:30
```

| Schedule kind | When it fires |
|---------------|---------------|
| `reminder` | Sends `⏰ Reminder: …` in Telegram |
| `task` | Runs the agent with your message (good for news, reports) |

Timing options the agent can set: `in_minutes` (e.g. 5), `daily_at` in 24h local time (e.g. `08:00`), or `at` (ISO datetime). Schedules are stored in `~/.agent-dev/schedules.json`. Ask the agent to cancel a schedule by id, or use `/schedules` to list them.

**Requirements:** the gateway process must stay running (see [Run](#run) above). If a **task** fires while the agent is busy, it retries in about a minute. **Reminders** always send immediately.

### Security

- Only users in `allowedUserIds` can chat with the agent (except `/whoami` for setup).
- The bot can run shell commands on your PC after you approve them — treat the bot token like a password.
- Do not commit `settings.json` with tokens to git.

## Interactive commands

| Command | Description |
|---------|-------------|
| `/model`, `/m [search]` | Open model selector (grouped by provider) |
| `/build` | Switch to Build mode (full tool access) |
| `/plan` | Switch to Plan mode (read-only exploration) |
| `/boss` | Toggle boss orchestrator mode |
| `/tasks` | Show the active task plan |
| `/trace` | Show path to the latest worker trace log |
| `/sessions` | Browse and load saved chat sessions |
| `/settings` | Thinking level and API key status |
| `/connect` | Configure gateway connection (Telegram bot token and allowed user IDs) |
| `/skills` | Browse and install skills (Vercel CLI) |
| `/skill <name>` | Load a skill for the current turn |
| `/new` | Start a new session |
| `/quit` | Exit |

**Keyboard shortcuts:**

- **Tab** / **Shift+Tab** — cycle Build ↔ Plan when input is empty
- **Esc** — abort a running turn
- **Ctrl+G** — scroll chat to latest
- **Ctrl+U** / **Ctrl+D** — scroll chat up/down

## Agent modes

### Build and Plan

Switch between **Build** and **Plan** mode like OpenCode:

| Mode | Toggle | Behavior |
|------|--------|----------|
| **Build** (default) | Tab / `/build` | Full tool access — edit files, run shell, verify |
| **Plan** | Tab / `/plan` | Read-only — explore code, research, write plans to `.agent-dev/plans/*.md` |

- Current mode is shown in the prompt footer (`Build` or `Plan`)
- Plan mode blocks write/edit/bash/verify/database/MCP; git write actions are denied
- Switch Plan → Build before implementing; the agent gets a reminder to execute the plan

### Boss orchestrator (opt-in)

Boss mode adds a **hierarchical orchestrator** on top of the normal agent loop. The boss plans work, delegates to specialized workers sequentially, monitors their progress, and synthesizes a final answer.

Enable with `--boss` or `/boss`. The footer shows **BOSS** in purple when active.

```
User → Boss (plan + delegate)
         ├─ explore worker   (read-only research)
         ├─ implement worker (code changes)
         ├─ shell worker     (commands & tests)
         └─ plan worker      (architecture docs)
```

| Worker | Role | Tools |
|--------|------|-------|
| `explore` | Read-only codebase research | read, grep, git, docs, browser |
| `implement` | Focused code changes | read, write, edit, diff, grep, verify |
| `shell` | Commands and tests | bash, exec, verify |
| `plan` | Planning documents | plan, read, grep |

The boss only has `plan` and `delegate` tools — it does not edit files or run shell commands directly. Worker activity is streamed in the TUI and logged to `~/.agent-dev/traces/<sessionId>/<runId>.jsonl`. Use `/trace` to find the latest log.

Boss mode uses the same model you select in `/model`. Workers run in isolated contexts with scoped task briefs.

## Tools

The agent has **19 built-in tools** (`delegate` is boss-only; 18 are available in normal mode):

| Tool | Description |
|------|-------------|
| `read` | Read a file in the project directory |
| `write` | Create or overwrite a file |
| `edit` | Replace text in a file |
| `diff` | Preview unified diff before applying changes |
| `grep` | Search codebase (ripgrep; on Windows uses **findstr**, then PowerShell) |
| `git` | Git status, diff, log, commit, etc. (writes need approval) |
| `bash` | Run a shell command — **requires approval** |
| `exec` | Structured shell command (`cmd` array) — **requires approval** |
| `web_search` | Search the internet (DuckDuckGo / Google News) |
| `docs` | Look up npm READMEs, MDN, or fetch a docs URL |
| `memory` | Store/recall long-term facts in `~/.agent-dev/memory.json` |
| `plan` | Create and track multi-step task plans (supports assignee, parent task, run id) |
| `delegate` | **Boss only** — spawn a worker agent for a focused subtask |
| `database` | Run SQL on SQLite files (mutations need approval) |
| `verify` | Auto-run tests/build from `package.json` scripts |
| `mcp` | Call tools from MCP servers (see below) |
| `skill` | Load a skill by name from `available_skills` |
| `schedule` | Schedule Telegram reminders and daily recurring tasks (gateway must be running) |
| `browser` | Control a real Chromium browser (navigate, click, extract, screenshot) |

File operations are restricted to the current working directory. Shell commands, git writes, SQL mutations, MCP tool calls, and destructive browser actions prompt for approval (`y` / `n`). In boss mode, approval prompts show which worker requested the action.

### Browser automation

Requires a one-time browser install:

```bash
npx playwright install chromium
```

The browser runs **visible by default** so you can watch the agent. Session state (tabs, cookies) persists across tool calls within a chat session.

| Action | Description |
|--------|-------------|
| `open` | Launch browser and open URL in a new tab |
| `goto` | Navigate active tab to URL |
| `click` / `type` / `select` / `check` | Interact with page elements (CSS selectors) |
| `waitFor` | Wait for selector to appear |
| `getPageContent` | Inspect page — URL, text, interactive elements |
| `extract` | Read text/value from a selector |
| `screenshot` | Save PNG to `~/.agent-dev/screenshots/` |
| `listTabs` / `switchTab` / `newTab` / `closeTab` | Multi-tab control |
| `waitForUser` | Pause for CAPTCHA, OTP, or manual payment |
| `close` | Close browser |

Optional settings in `~/.agent-dev/settings.json`:

```json
{
  "browser": {
    "headless": false,
    "actionTimeoutMs": 30000
  }
}
```

**Safety:** Purchases, booking confirmations, and payment steps require approval or manual user action. The agent pauses automatically on CAPTCHA/OTP/payment fields. Load the `browser-automation` skill for multi-step workflows.

**Plan mode:** Read-only browser actions only (`goto`, `extract`, `getPageContent`, `screenshot`). Form interactions require Build mode.

### MCP configuration

Add servers to `~/.agent-dev/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/projects"]
    }
  }
}
```

Use the `mcp` tool with `list_servers`, `list_tools`, and `call_tool` actions.

### Skills

Skills use the [Vercel Agent Skills](https://vercel.com/docs/agent-resources/skills) ecosystem (same format as OpenCode and Cursor).

**Install skills:**

```bash
agent skills add vercel-labs/agent-skills
agent skills add vercel-labs/agent-skills -g          # global
agent skills find react
agent skills list
```

In the TUI, run `/skills` and press `a` to install from a repo (press `o` to open the catalog in your browser).

**Browse what's available:**

- [skills.sh](https://skills.sh) — searchable directory of community + Vercel skills
- [Vercel Agent Skills docs](https://vercel.com/docs/agent-resources/skills) — official curated list
- `agent skills find <query>` — search from the terminal

**Discovery paths** (later entries override same name):

| Scope | Path |
|-------|------|
| Global (Vercel CLI) | `~/.config/agents/skills/` |
| Global (compat) | `~/.agents/skills/` |
| Project | `.agents/skills/` (walk up to git root) |
| Agent config | `~/.agent-dev/skills/` |
| Custom | `skills.paths` in `settings.json` |

The agent sees an `<available_skills>` catalog in its system prompt and loads full instructions with the `skill` tool (or `/skill <name>` in chat).

Filter skills in `~/.agent-dev/settings.json`:

```json
{
  "skills": {
    "enabled": ["vercel-react-best-practices"],
    "disabled": ["canvas"],
    "paths": ["~/team-skills"]
  }
}
```

## Configuration

All config lives under `~/.agent-dev/` (override with `AGENT_DEV_DIR`):

| Path | Purpose |
|------|---------|
| `settings.json` | Default provider/model, thinking level, agent mode, orchestrator mode, API keys, skills |
| `sessions/*.jsonl` | Chat history (one file per session) |
| `last-session.json` | Pointer to resume with `-c` |
| `memory.json` | Cross-session memory |
| `plan.json` | Active task plan |
| `mcp.json` | MCP server definitions |
| `traces/<sessionId>/` | Boss worker trace logs (JSONL) |
| `telegram-sessions.json` | Telegram chat → session id mapping |
| `schedules.json` | Active reminders and daily scheduled tasks |

Example `settings.json`:

```json
{
  "defaultProvider": "free",
  "defaultModel": "meta-llama/llama-3.3-70b-instruct:free",
  "thinkingLevel": "off",
  "agentMode": "build",
  "orchestratorMode": "off"
}
```

Set `orchestratorMode` to `"boss"` to enable boss mode by default.

### Environment variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter (free tier models) |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GROQ_API_KEY` | Groq |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Google Gemini |
| `AGENT_DEV_DIR` | Config directory (default `~/.agent-dev`) |
| `AGENT_MAX_TOOL_ROUNDS` | Max tool-call rounds per turn (default `50`) |
| `AGENT_MAX_DELEGATIONS` | Max worker delegations per boss turn (default `10`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (overrides settings) |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated Telegram user IDs |

## Architecture

agent-dev is a single-agent **ReAct loop** — no LangGraph or external agent framework. The core loop streams an LLM response, executes tool calls, and repeats until done.

Boss mode nests additional `runAgentLoop` instances inside the `delegate` tool, following the [orchestrator-workers](https://www.anthropic.com/engineering/building-effective-agents) pattern: the boss dynamically decomposes tasks and delegates to workers with isolated context.

```
src/
├── agent/
│   ├── loop.ts              # Core ReAct loop
│   ├── session.ts           # Session state, events, boss routing
│   ├── orchestrator/        # Boss prompt, workers, traces
│   └── tools/               # Built-in tool implementations
├── gateway/
│   ├── telegram/            # Telegram bot daemon (grammY)
│   └── scheduler.ts         # Fires due reminders and daily tasks
├── providers/               # OpenAI, Groq, Gemini, OpenRouter
├── ui/                      # Ink TUI
└── modes/print-mode.ts      # Headless / CI output
```

## License

MIT
