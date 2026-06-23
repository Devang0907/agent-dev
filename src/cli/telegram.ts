import { runTelegramGateway } from "../gateway/telegram/bot.js";

export interface TelegramCliArgs {
  workdir?: string;
  boss: boolean;
  model?: string;
  verbose: boolean;
  help: boolean;
}

export function parseTelegramArgs(argv: string[]): TelegramCliArgs {
  const args = argv.slice(3);
  const result: TelegramCliArgs = {
    boss: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "--boss") {
      result.boss = true;
    } else if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--workdir" && args[i + 1]) {
      result.workdir = args[++i];
    } else if (arg === "--model" && args[i + 1]) {
      result.model = args[++i];
    }
  }

  return result;
}

export function printTelegramHelp(): void {
  console.log(`
agent telegram — Telegram gateway for remote chat

Usage:
  agent telegram [--workdir <path>] [--boss] [--model <ref>] [--verbose]

Options:
  --workdir <path>   Project directory the agent operates on (default: cwd or settings)
  --boss             Enable boss orchestrator mode
  --model <ref>      Provider/model (e.g. groq/llama-3.3-70b-versatile)
  --verbose, -v      Show worker tool activity
  -h, --help         Show help

Configuration (~/.agent-dev/settings.json or env):
  telegram.botToken          Bot token from @BotFather
  telegram.allowedUserIds    Numeric Telegram user IDs (required for access)
  telegram.workdir           Default workdir

Environment:
  TELEGRAM_BOT_TOKEN         Overrides telegram.botToken
  TELEGRAM_ALLOWED_USER_IDS  Comma-separated user IDs

Telegram commands:
  /whoami    Show your Telegram user ID (for allowlist setup)
  /new       Start a new agent session
  /status    Model, workdir, session id
  /stop      Abort current turn
`);
}

export async function runTelegramCommand(argv: string[]): Promise<void> {
  const args = parseTelegramArgs(argv);

  if (args.help) {
    printTelegramHelp();
    return;
  }

  await runTelegramGateway({
    workdir: args.workdir,
    boss: args.boss,
    model: args.model,
    verbose: args.verbose,
  });
}
