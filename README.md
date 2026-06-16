# agent-dev

A minimal pi-like terminal coding agent with an Ink UI. Chat with an AI that can read, write, edit files, and run bash commands.

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

The agent has four built-in tools: `read`, `write`, `edit`, `bash`. File operations are restricted to the current working directory.

## License

MIT
