import { Bot, GrammyError } from "grammy";
import { loadSettings, setOrchestratorMode } from "../../config/settings.js";
import { SessionManager } from "../../session/manager.js";
import { AgentSession } from "../../agent/session.js";
import { loadTelegramConfig, isUserAllowed, type TelegramGatewayOptions } from "../config.js";
import {
  getSessionIdForChat,
  setSessionIdForChat,
  hasWelcomedUser,
  markUserWelcomed,
} from "./persistence.js";
import {
  TelegramSessionBridge,
  parseApprovalCallback,
  parseBrowserContinueCallback,
  sendBusyReply,
} from "./adapter.js";
import { logGateway, logUserCommand, logUserMessage } from "./logger.js";
import {
  applyAgentMode,
  applyBossMode,
  applyModel,
  applyCompact,
  formatModeStatus,
  formatModelList,
  formatContextStatus,
  parseBossArg,
  toggleBossMode,
} from "./commands.js";
import { formatWelcomeMessage } from "./welcome.js";
import { startScheduleRunner } from "../scheduler.js";
import { loadSchedules } from "../../agent/tools/schedule.js";
import type { Context } from "grammy";

const TELEGRAM_SLASH_COMMANDS = new Set([
  "/start",
  "/help",
  "/new",
  "/whoami",
  "/status",
  "/stop",
  "/build",
  "/plan",
  "/boss",
  "/mode",
  "/model",
  "/schedules",
]);

export async function runTelegramGateway(cliOptions: TelegramGatewayOptions & { boss?: boolean; model?: string }): Promise<void> {
  // Prevent stdin EOF from exiting the gateway on Windows terminals.
  if (process.stdin.isTTY) {
    process.stdin.resume();
  }

  process.on("unhandledRejection", (reason) => {
    console.error("[telegram] Unhandled rejection:", reason);
  });

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
  const startupMode = settings.agentMode ?? "build";
  const startupBoss = settings.orchestratorMode === "boss";
  console.log(
    `[telegram] Default mode: ${startupMode}${startupBoss ? " · BOSS" : ""} — use /build, /plan, /boss, /model from Telegram`,
  );

  const bot = new Bot(config.botToken);
  const bridges = new Map<number, TelegramSessionBridge>();

  startScheduleRunner({
    api: bot.api,
    getBridge: (chatId) => bridges.get(chatId),
  });

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

  function welcomeText(chatId: number): string {
    const bridge = getOrCreateBridge(chatId);
    const model = bridge.session.getModel();
    return formatWelcomeMessage({
      workdir: config.workdir,
      modelRef: `${model.provider}/${model.id}`,
      agentMode: bridge.session.getAgentMode(),
      boss: bridge.session.getOrchestratorMode() === "boss",
    });
  }

  async function replyWelcome(ctx: Context, userId: number, markWelcomed = true): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await ctx.reply(welcomeText(chatId));
    if (markWelcomed) {
      markUserWelcomed(userId);
      logGateway(`Welcome guide sent to user ${userId}`);
    }
  }

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    logUserCommand(userId, "/start");

    if (!isUserAllowed(userId, config.allowedUserIds)) {
      await ctx.reply(
        [
          "Welcome to agent-dev!",
          "",
          `Your Telegram user ID: ${userId}`,
          "",
          "Add this ID to telegram.allowedUserIds in ~/.agent-dev/settings.json",
          "(or set TELEGRAM_ALLOWED_USER_IDS), then restart the gateway.",
          "",
          "Then send /start again to see available commands.",
        ].join("\n"),
      );
      return;
    }

    await replyWelcome(ctx, userId);
  });

  bot.command("whoami", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    logUserCommand(userId, "/whoami");
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

  bot.command("help", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/help");
    await replyWelcome(ctx, userId, false);
  });

  bot.command("new", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/new");

    const bridge = getOrCreateBridge(chatId);
    if (bridge.session.isRunning()) {
      await sendBusyReply(ctx);
      return;
    }

    bridge.session.newSession();
    setSessionIdForChat(chatId, bridge.session.getSessionId());
    logGateway("New session started");
    await ctx.reply("Started a new session.");
  });

  bot.command("status", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/status");

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
        formatContextStatus(bridge.session),
      ].join("\n"),
    );
  });

  bot.command("compact", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    logUserCommand(userId, `/compact${arg ? ` ${arg}` : ""}`);

    const bridge = getOrCreateBridge(chatId);
    if (bridge.session.isRunning()) {
      await ctx.reply("Cannot compact while the agent is running. Use /stop first.");
      return;
    }

    const message = await applyCompact(bridge.session, arg || undefined);
    await ctx.reply(message);
  });

  bot.command("stop", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/stop");
    logGateway("Turn aborted by user");

    const bridge = getOrCreateBridge(chatId);
    bridge.session.abort();
    await ctx.reply("Aborted current turn.");
  });

  bot.command("build", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/build");
    const bridge = getOrCreateBridge(chatId);
    await ctx.reply(applyAgentMode(bridge.session, "build"));
  });

  bot.command("plan", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/plan");
    const bridge = getOrCreateBridge(chatId);
    await ctx.reply(applyAgentMode(bridge.session, "plan"));
  });

  bot.command("boss", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    logUserCommand(userId, `/boss${arg ? ` ${arg}` : ""}`);

    const bridge = getOrCreateBridge(chatId);
    const action = parseBossArg(arg || undefined);
    const message =
      action === "toggle"
        ? toggleBossMode(bridge.session)
        : applyBossMode(bridge.session, action);
    await ctx.reply(message);
  });

  bot.command("mode", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "";
    logUserCommand(userId, `/mode${arg ? ` ${arg}` : ""}`);

    const bridge = getOrCreateBridge(chatId);

    if (!arg) {
      await ctx.reply(
        [
          formatModeStatus(bridge.session),
          "",
          "Commands:",
          "  /build — full tool access (edit files, run shell)",
          "  /plan — read-only exploration",
          "  /boss — toggle boss orchestrator",
          "  /boss on|off — enable/disable boss mode",
        ].join("\n"),
      );
      return;
    }

    if (arg === "build") {
      await ctx.reply(applyAgentMode(bridge.session, "build"));
      return;
    }
    if (arg === "plan") {
      await ctx.reply(applyAgentMode(bridge.session, "plan"));
      return;
    }
    if (arg === "boss") {
      await ctx.reply(toggleBossMode(bridge.session));
      return;
    }

    const bossAction = parseBossArg(arg);
    if (bossAction !== "toggle") {
      await ctx.reply(applyBossMode(bridge.session, bossAction));
      return;
    }

    await ctx.reply(`Unknown mode: ${arg}\n\nUse /mode to see options.`);
  });

  bot.command("model", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    logUserCommand(userId, `/model${arg ? ` ${arg}` : ""}`);

    const bridge = getOrCreateBridge(chatId);

    if (!arg) {
      await ctx.reply(formatModelList(bridge.session));
      return;
    }

    await ctx.reply(applyModel(bridge.session, arg));
  });

  bot.command("schedules", async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    logUserCommand(userId, "/schedules");

    const store = loadSchedules();
    const entries = Object.values(store)
      .filter((e) => e.enabled && e.chatId === chatId)
      .sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt));

    if (entries.length === 0) {
      await ctx.reply("No active schedules for this chat.");
      return;
    }

    const lines = entries.map((e) => {
      const when = e.dailyAt
        ? `daily ${e.dailyAt}`
        : new Date(e.nextFireAt).toLocaleString();
      return `• ${e.id} [${e.kind}] ${when}\n  ${e.message}`;
    });
    await ctx.reply(["Active schedules:", "", ...lines].join("\n"));
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    const browserContinue = parseBrowserContinueCallback(data);
    if (browserContinue) {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await safeAnswerCallback(ctx, undefined);
        return;
      }
      const bridge = bridges.get(chatId);
      const messageId = ctx.callbackQuery.message?.message_id;
      if (!bridge || !messageId) {
        await safeAnswerCallback(ctx, "Session expired.");
        return;
      }
      await safeAnswerCallback(ctx, "Continuing");
      void bridge.handleBrowserContinueCallback(browserContinue.id, messageId);
      return;
    }

    const parsed = parseApprovalCallback(data);
    if (!parsed) {
      await safeAnswerCallback(ctx, undefined);
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      await safeAnswerCallback(ctx, undefined);
      return;
    }

    const bridge = bridges.get(chatId);
    const approved = parsed.action === "approve";
    const label = approved ? "Approved" : "Denied";

    if (!bridge) {
      await safeAnswerCallback(ctx, "Session expired.");
      return;
    }

    const messageId = ctx.callbackQuery.message?.message_id;
    if (!messageId) {
      await safeAnswerCallback(ctx, undefined);
      return;
    }

    // Telegram requires answerCallbackQuery within ~10s — answer before slow work.
    await safeAnswerCallback(ctx, label);

    void bridge.handleApprovalCallback(parsed.id, approved, messageId);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from?.id;
    if (!text || !userId || TELEGRAM_SLASH_COMMANDS.has(text.split(/\s/)[0]!)) return;

    const chatId = ctx.chat.id;
    const bridge = getOrCreateBridge(chatId);

    if (!hasWelcomedUser(userId)) {
      await replyWelcome(ctx, userId);
    }

    if (bridge.session.isRunning()) {
      logUserMessage(userId, text);
      logGateway("Agent busy — message not queued");
      await sendBusyReply(ctx);
      return;
    }

    logUserMessage(userId, text);

    // Do not await — grammY long-polling processes updates sequentially; blocking
    // here would prevent Approve/Deny callback_query from being handled.
    void bridge
      .prompt(text, userId)
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[telegram] prompt error:", err);
        try {
          await ctx.reply(`Error: ${message}`);
        } catch (replyErr) {
          console.error("[telegram] Failed to send error reply:", replyErr);
        }
      });
  });

  bot.catch((err) => {
    if (isExpiredCallbackError(err)) return;
    console.error("[telegram] Bot error:", err);
  });

  // Restart polling if it stops unexpectedly (network blips, etc.).
  while (true) {
    try {
      await bot.start({
        onStart: (botInfo) => {
          console.log(`[telegram] Bot @${botInfo.username} is running (long polling)`);
        },
      });
      console.warn("[telegram] Bot polling stopped — restarting in 3s...");
    } catch (err) {
      console.error("[telegram] Bot polling crashed — restarting in 3s:", err);
    }
    await sleep(3000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExpiredCallbackError(err: unknown): boolean {
  if (err instanceof GrammyError) {
    return err.error_code === 400 && /query is too old|query ID is invalid/i.test(err.description);
  }
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error: unknown }).error;
    return isExpiredCallbackError(inner);
  }
  return false;
}

async function safeAnswerCallback(
  ctx: { answerCallbackQuery: (opts?: { text: string }) => Promise<boolean> },
  text: string | undefined,
): Promise<void> {
  try {
    if (text) {
      await ctx.answerCallbackQuery({ text });
    } else {
      await ctx.answerCallbackQuery();
    }
  } catch (err) {
    if (!isExpiredCallbackError(err)) {
      console.error("[telegram] answerCallbackQuery failed:", err);
    }
  }
}
