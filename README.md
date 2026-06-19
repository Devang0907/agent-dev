# agent-dev

A minimal pi-like terminal coding agent with an Ink UI. Chat with an AI that can search, edit, and verify code, run git/shell commands (with approval), and more.

## Quick start

```bash
npm install
npm run dev
```

Set at least one API key:

```bash
export OPENROUTER_API_KEY=sk-or-...   # Free models (default)
export OPENAI_API_KEY=sk-...          # ChatGPT
export GROQ_API_KEY=gsk_...           # Groq
export GEMINI_API_KEY=...             # Google Gemini
```

## Providers

| Provider | Env var | Example models |
|----------|---------|----------------|
| OpenAI (ChatGPT) | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| Google Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| Free (OpenRouter) | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` |

## Interactive commands

| Command | Description |
|---------|-------------|
| `/model` | Open model selector (grouped by provider) |
| `/model groq` | Open selector filtered by search |
| `/build` | Switch to Build mode (full tool access) |
| `/plan` | Switch to Plan mode (read-only exploration) |
| `/settings` | Thinking level, theme, API key status |
| `/skills` | Browse and install skills (Vercel CLI) |
| `/skill <name>` | Load a skill for the current turn |
| `/new` | Clear session |
| `/quit` | Exit |

## Agent modes

Switch between **Build** and **Plan** mode like OpenCode:

| Mode | Toggle | Behavior |
|------|--------|----------|
| **Build** (default) | Tab / `/build` | Full tool access — edit files, run shell, verify |
| **Plan** | Tab / `/plan` | Read-only — explore code, research, write plans to `.agent-dev/plans/*.md` |

- **Tab** cycles mode when the input is empty (Shift+Tab reverses)
- Current mode is shown in the prompt footer (`Build` or `Plan`)
- Plan mode blocks write/edit/bash/verify/database/MCP; git write actions are denied
- Switch Plan → Build before implementing; the agent gets a reminder to execute the plan

## CLI

```bash
npm run dev                          # Interactive
npm run dev -- -p "List files"       # Print mode
npm run dev -- -c                    # Continue last session
npm run dev -- --model groq/llama-3.3-70b-versatile "hello"
npm run build && npm start
```

Config and sessions are stored in `~/.agent-dev/`.

## Tools

The agent has fifteen built-in tools:

| Tool | Description |
|------|-------------|
| `read` | Read a file in the project directory |
| `write` | Create or overwrite a file |
| `edit` | Replace text in a file |
| `diff` | Preview unified diff before applying changes |
| `grep` | Search codebase (ripgrep; on Windows uses **findstr**, then PowerShell) |
| `git` | Git status, diff, log, commit, etc. (writes need approval) |
| `bash` | Run a shell command — **requires approval** |
| `web_search` | Search the internet (DuckDuckGo / Google News) |
| `docs` | Look up npm READMEs, MDN, or fetch a docs URL |
| `memory` | Store/recall long-term facts in `~/.agent-dev/memory.json` |
| `plan` | Create and track multi-step task plans |
| `database` | Run SQL on SQLite files (mutations need approval) |
| `verify` | Auto-run tests/build from `package.json` scripts |
| `mcp` | Call tools from MCP servers (see below) |
| `skill` | Load a skill by name from available_skills |

File operations are restricted to the current working directory. Shell commands, git writes, SQL mutations, and MCP tool calls prompt for approval (`y` / `n`).

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

## License

MIT
