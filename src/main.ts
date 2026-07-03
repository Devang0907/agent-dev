import { render } from "ink";
import React from "react";
import { loadSettings, setOrchestratorMode } from "./config/settings.js";
import { SessionManager } from "./session/manager.js";
import { AgentSession } from "./agent/session.js";
import { parseArgs, printHelp } from "./cli/args.js";
import { runSkillsCommand } from "./cli/skills.js";
import { runTelegramCommand } from "./cli/telegram.js";
import { runPrintMode } from "./modes/print-mode.js";
import { App } from "./ui/App.js";

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
    : args.multi
      ? setOrchestratorMode(loadSettings(), "multi")
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

  const usePrint = args.print || !process.stdin.isTTY || !process.stdout.isTTY;

  if (usePrint) {
    const prompt = args.prompt ?? "";
    if (!prompt) {
      console.error("Print mode requires a prompt argument.");
      process.exit(1);
    }
    await runPrintMode(session, prompt);
    return;
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      session,
      workdir,
      onQuit: () => {},
    }),
  );

  if (args.prompt) {
    setTimeout(() => session.prompt(args.prompt!), 100);
  }

  await waitUntilExit();
}
