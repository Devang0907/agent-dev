import { loadSettings, setOrchestratorMode } from "./config/settings.js";
import { SessionManager } from "./session/manager.js";
import { AgentSession } from "./agent/session.js";
import { parseArgs, printHelp } from "./cli/args.js";
import { runSkillsCommand } from "./cli/skills.js";
import { runTelegramCommand } from "./cli/telegram.js";
import { runPrintMode } from "./modes/print-mode.js";
import { startApp } from "./tui/app.js";

export async function main(): Promise<void> {
  if (process.argv[2] === "skills") {
    const code = await runSkillsCommand(process.argv.slice(3));
    process.exit(code);
  }

  if (process.argv[2] === "telegram") {
    await runTelegramCommand(process.argv);
    return;
  }

  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  const settings = args.boss
    ? setOrchestratorMode(loadSettings(), "boss")
    : loadSettings();
  const workdir = process.cwd();

  let sessionManager: SessionManager;
  if (args.continueSession) {
    sessionManager = SessionManager.loadLast() ?? new SessionManager(undefined, workdir);
  } else {
    sessionManager = new SessionManager(undefined, workdir);
  }

  const initialModel = AgentSession.resolveInitialModel(settings, args.model);
  const session = new AgentSession(settings, sessionManager, workdir, initialModel);

  if (args.print) {
    let prompt = args.prompt?.trim() ?? "";
    if (!prompt && process.stdin.isTTY === false) {
      prompt = (await Bun.stdin.text()).trim();
    }
    if (!prompt) {
      console.error(
        "Print mode requires a prompt argument.\n" +
          "  agent -p \"your prompt\"\n" +
          "Or run without -p in an interactive terminal for the TUI.",
      );
      process.exit(1);
    }
    await runPrintMode(session, prompt);
    return;
  }

  if (process.stdin.isTTY === false) {
    const piped = (await Bun.stdin.text()).trim();
    if (piped) {
      await runPrintMode(session, piped);
      return;
    }
  }

  try {
    await startApp({
      session,
      workdir,
      initialPrompt: args.prompt,
    });
  } catch (err) {
    console.error("Failed to start terminal UI:", err);
    process.exit(1);
  }
}
