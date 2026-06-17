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
| `/settings` | Thinking level, theme, API key status |
| `/new` | Clear session |
| `/quit` | Exit |

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

The agent has fourteen built-in tools:

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

## License

MIT
