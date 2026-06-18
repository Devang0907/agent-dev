export interface CliArgs {
  print: boolean;
  continueSession: boolean;
  model?: string;
  prompt?: string;
  help: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    print: false,
    continueSession: false,
    help: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "-p" || arg === "--print") {
      result.print = true;
    } else if (arg === "-c" || arg === "--continue") {
      result.continueSession = true;
    } else if (arg === "--model" && args[i + 1]) {
      result.model = args[++i];
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    result.prompt = positional.join(" ");
  }

  return result;
}

export function printHelp(): void {
  console.log(`
agent-dev — minimal pi-like coding agent

Usage:
  agent                          Interactive mode
  agent -p "prompt"              Print mode (no TUI)
  agent -c                       Continue last session
  agent --model groq/llama-3.3-70b-versatile "prompt"

  agent skills add vercel-labs/agent-skills
  agent skills list

Options:
  -p, --print          Print response and exit
  -c, --continue       Continue most recent session
  --model <ref>        Provider/model (e.g. openai/gpt-4o)
  -h, --help           Show help

Commands (interactive):
  /model, /m [search]  Select model
  /settings            Settings menu
  /skills              Browse/install skills
  /skill <name>        Load a skill for one turn
  /new                 New session
  /quit                Quit

Environment:
  OPENAI_API_KEY       OpenAI (ChatGPT)
  GROQ_API_KEY         Groq
  GEMINI_API_KEY       Google Gemini
  OPENROUTER_API_KEY   Free models via OpenRouter
`);
}
