import { Bot } from "grammy";
import { loadSettings, setOrchestratorMode } from "../../config/settings.js";
import { SessionManager } from "../../session/manager.js";
import { AgentSession } from "../../agent/session.js";
import { loadTelegramConfig, isUserAllowed, type TelegramGatewayOptions } from "../config.js";
import {
  getSessionIdForChat,
  setSessionIdForChat,
} from "./persistence.js";
import {
  TelegramSessionBridge,
  parseApprovalCallback,
  sendBusyReply,
} from "./adapter.js";

const SLASH_COMMANDS = new Set(["/new", "/whoami", "/status", "/stop"]);

export async function runTelegramGateway(cliOptions: TelegramGatewayOptions & { boss?: boolean; model?: string }): Promise<void> {
  const config = loadTelegramConfig(cliOptions);
  process.chdir(config.workdir);

  let settings = loadSettings();
  if (cliOptions.boss) {
    settings = setOrchestratorMode(settings, "boss");
  }

  const verbose = cliOptions.verbose ?? false;

  if (config.allowedUserIds.length === 0) {
    console.warn(
      "[telegram] No allowed user IDs configured. DMs will be logged but ignored until you add your ID to telegram.allowedUserIds or TELEGRAM_ALLOWED_USER_IDS.",
    );
  }

  console.log(`[telegram] Gateway starting (workdir: ${config.workdir})`);

  const bot = new Bot(config.botToken);
  const bridges = new Map<number, TelegramSessionBridge>();

  function getOrCreateBridge(chatId: number): TelegramSessionBridge {
    let bridge = bridges.get(chatId);
    if (bridge) return bridge;

    const existingSessionId = getSessionIdForChat(chatId);
    const sessionManager = existingSessionId
      ? new SessionManager(existingSessionId, config.workdir)
      : new SessionManager(undefined, config.workdir);

    if (!existingSessionId) {
      setSessionIdForChat(chatId, sessionManager.sessionId);
    }

    const initialModel = AgentSession.resolveInitialModel(settings, cliOptions.model);
    const session = new AgentSession(settings, sessionManager, config.workdir, initialModel);
    bridge = new TelegramSessionBridge(session, bot.api, chatId, verbose);
    bridge.attach();
    bridges.set(chatId, bridge);
    return bridge;
  }

  bot.command("whoami", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.reply(`Your Telegram user ID: ${userId}`);
  });

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!isUserAllowed(userId, config.allowedUserIds)) {
      if (ctx.message?.text || ctx.callbackQuery) {
        console.log(`[telegram] Rejected message from user ${userId} (not in allowlist). Add to telegram.allowedUserIds or TELEGRAM_ALLOWED_USER_IDS.`);
      }
      return;
    }

    await next();
  });

  bot.command("new", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const bridge = getOrCreateBridge(chatId);
    if (bridge.session.isRunning()) {
      await sendBusyReply(ctx);
      return;
    }

    bridge.session.newSession();
    setSessionIdForChat(chatId, bridge.session.getSessionId());
    await ctx.reply("Started a new session.");
  });

  bot.command("status", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const bridge = getOrCreateBridge(chatId);
    const model = bridge.session.getModel();
    const boss = bridge.session.getOrchestratorMode() === "boss";
    const running = bridge.session.isRunning();

    await ctx.reply(
      [
        `Model: ${model.provider}/${model.id}`,
        `Workdir: ${config.workdir}`,
        `Session: ${bridge.session.getSessionId()}`,
        `Mode: ${bridge.session.getAgentMode()}${boss ? " · BOSS" : ""}`,
        `Status: ${running ? "busy" : "idle"}`,
      ].join("\n"),
    );
  });

  bot.command("stop", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const bridge = getOrCreateBridge(chatId);
    bridge.session.abort();
    await ctx.reply("Aborted current turn.");
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseApprovalCallback(data);
    if (!parsed) {
      await ctx.answerCallbackQuery();
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const bridge = bridges.get(chatId);
    if (!bridge) {
      await ctx.answerCallbackQuery({ text: "Session expired." });
      return;
    }

    const messageId = ctx.callbackQuery.message?.message_id;
    if (!messageId) {
      await ctx.answerCallbackQuery();
      return;
    }

    await bridge.handleApprovalCallback(parsed.id, parsed.action === "approve", messageId);
    await ctx.answerCallbackQuery({ text: parsed.action === "approve" ? "Approved" : "Denied" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || SLASH_COMMANDS.has(text.split(/\s/)[0]!)) return;

    const chatId = ctx.chat.id;
    const bridge = getOrCreateBridge(chatId);

    if (bridge.session.isRunning()) {
      await sendBusyReply(ctx);
      return;
    }

    try {
      await bridge.prompt(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[telegram] prompt error:", err);
      await ctx.reply(`Error: ${message}`);
    }
  });

  bot.catch((err) => {
    console.error("[telegram] Bot error:", err);
  });

  await bot.start({
    onStart: (botInfo) => {
      console.log(`[telegram] Bot @${botInfo.username} is running (long polling)`);
    },
  });
}
