import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { SCREENSHOTS_DIR } from "../../../config/paths.js";
import { getBrowserContext } from "../browser-context.js";
import { detectPageBlockers } from "./detectors.js";
import { formatBrowserError } from "./errors.js";
import { getBrowserSession } from "./session.js";
import type { BrowserToolArgs } from "./types.js";

const MAX_PAGE_CONTENT_CHARS = 8000;

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

async function assertSelector(page: Page, selector: string, timeout: number): Promise<void> {
  const count = await page.locator(selector).count();
  if (count === 0) {
    await page.waitForSelector(selector, { timeout, state: "visible" });
  }
}

async function maybePauseForBlockers(page: Page): Promise<string | null> {
  const ctx = getBrowserContext();
  if (!ctx) return null;

  const blocker = await detectPageBlockers(page);
  if (!blocker) return null;

  if (blocker.kind === "otp") {
    const value = await ctx.requestUserInput(blocker.reason, "Enter OTP or verification code");
    return value ? `User provided input for ${blocker.kind}. Continue with the next step.` : "User dismissed input prompt.";
  }

  await ctx.requestUserStep(blocker.reason);
  return `Paused for ${blocker.kind}: user completed manual step.`;
}

async function buildPageContent(page: Page): Promise<string> {
  const url = page.url();
  const title = await page.title();

  const interactive = await page.evaluate(() => {
    const elements: { tag: string; role: string; selector: string; label: string }[] = [];
    const candidates = Array.from(
      document.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [role='link']",
      ),
    );
    for (const el of candidates) {
      if (elements.length >= 40) break;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") ?? "";
      const id = el.id;
      const name = el.getAttribute("name");
      const testId = el.getAttribute("data-testid");
      let selector = tag;
      if (id) selector = `#${id}`;
      else if (testId) selector = `[data-testid="${testId}"]`;
      else if (name) selector = `${tag}[name="${name}"]`;
      const label =
        (el as HTMLElement).innerText?.trim().slice(0, 80) ||
        el.getAttribute("placeholder") ||
        el.getAttribute("aria-label") ||
        "";
      if (!label && tag === "input") continue;
      elements.push({ tag, role, selector, label });
    }
    return elements;
  });

  const visibleText = await page.evaluate(() => {
    const body = document.body;
    return body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 4000) ?? "";
  });

  const lines = [
    `URL: ${url}`,
    `Title: ${title}`,
    "",
    "## Visible text (truncated)",
    visibleText,
    "",
    "## Interactive elements",
    ...interactive.map(
      (e, i) => `${i + 1}. <${e.tag}${e.role ? ` role=${e.role}` : ""}> label="${e.label}" selector="${e.selector}"`,
    ),
  ];

  let result = lines.join("\n");
  if (result.length > MAX_PAGE_CONTENT_CHARS) {
    result = result.slice(0, MAX_PAGE_CONTENT_CHARS) + "\n…(truncated)";
  }
  return result;
}

export async function executeBrowserAction(args: BrowserToolArgs): Promise<string> {
  const ctx = getBrowserContext();
  if (!ctx) {
    return "Error: Browser tool context not available.";
  }

  const { sessionId, onProgress } = ctx;
  const session = getBrowserSession(sessionId, ctx.settings);
  const action = args.action;
  const timeout = session.defaultTimeout(args.timeout);

  try {
    onProgress(`browser ${action}...`);

    switch (action) {
      case "open": {
        if (!args.url) return "Error: url is required for open action.";
        const tabId = await session.openTab(args.url, onProgress);
        const pauseNote = await maybePauseForBlockers(session.resolvePage(tabId));
        onProgress(`Opened ${args.url} (tab ${tabId})`);
        return pauseNote
          ? `Opened browser at ${args.url} (tab ${tabId}). ${pauseNote}`
          : `Opened browser at ${args.url} (tab ${tabId}). Active tab: ${tabId}`;
      }

      case "goto": {
        if (!args.url) return "Error: url is required for goto action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Navigating to ${args.url}...`);
        await withRetry(() =>
          page.goto(args.url!, { waitUntil: "domcontentloaded", timeout: 60000 }),
        );
        const pauseNote = await maybePauseForBlockers(page);
        onProgress(`Navigated to ${args.url}`);
        return pauseNote
          ? `Navigated to ${args.url}. ${pauseNote}`
          : `Navigated to ${args.url}. Current URL: ${page.url()}`;
      }

      case "click": {
        if (!args.selector) return "Error: selector is required for click action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Clicking ${args.selector}...`);
        await assertSelector(page, args.selector, timeout);
        await withRetry(() => page.click(args.selector!, { timeout }));
        const pauseNote = await maybePauseForBlockers(page);
        onProgress(`Clicked ${args.selector}`);
        return pauseNote ? `Clicked ${args.selector}. ${pauseNote}` : `Clicked ${args.selector}`;
      }

      case "type": {
        if (!args.selector) return "Error: selector is required for type action.";
        if (args.text === undefined) return "Error: text is required for type action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Typing into ${args.selector}...`);
        await assertSelector(page, args.selector, timeout);
        await page.fill(args.selector, args.text, { timeout });
        onProgress(`Typed into ${args.selector}`);
        return `Typed into ${args.selector}`;
      }

      case "select": {
        if (!args.selector) return "Error: selector is required for select action.";
        if (!args.value) return "Error: value is required for select action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Selecting ${args.value} in ${args.selector}...`);
        await assertSelector(page, args.selector, timeout);
        await page.selectOption(args.selector, args.value, { timeout });
        onProgress(`Selected ${args.value}`);
        return `Selected "${args.value}" in ${args.selector}`;
      }

      case "check": {
        if (!args.selector) return "Error: selector is required for check action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Checking ${args.selector}...`);
        await assertSelector(page, args.selector, timeout);
        await page.check(args.selector, { timeout });
        onProgress(`Checked ${args.selector}`);
        return `Checked ${args.selector}`;
      }

      case "waitFor": {
        if (!args.selector) return "Error: selector is required for waitFor action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Waiting for ${args.selector}...`);
        await page.waitForSelector(args.selector, { timeout, state: "visible" });
        onProgress(`Found ${args.selector}`);
        return `Element visible: ${args.selector}`;
      }

      case "screenshot": {
        const page = session.resolvePage(args.tabId);
        mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const filename = `screenshot-${Date.now()}.png`;
        const filepath = join(SCREENSHOTS_DIR, filename);
        onProgress("Taking screenshot...");
        await page.screenshot({ path: filepath, fullPage: false });
        onProgress(`Screenshot saved`);
        return `Screenshot saved: ${filepath}`;
      }

      case "extract": {
        if (!args.selector) return "Error: selector is required for extract action.";
        const page = session.resolvePage(args.tabId);
        onProgress(`Extracting from ${args.selector}...`);
        await assertSelector(page, args.selector, timeout);
        const locator = page.locator(args.selector).first();
        const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
        const text =
          tag === "input" || tag === "textarea"
            ? await locator.inputValue()
            : await locator.innerText();
        onProgress(`Extracted from ${args.selector}`);
        return text.trim() || "(empty)";
      }

      case "getPageContent": {
        const page = session.resolvePage(args.tabId);
        onProgress("Reading page content...");
        const content = await buildPageContent(page);
        onProgress("Page content ready");
        return content;
      }

      case "listTabs": {
        const tabs = await session.listTabs();
        if (tabs.length === 0) return "No open tabs. Call browser open first.";
        return tabs
          .map((t) => `${t.active ? "* " : "  "}${t.tabId}: ${t.title || "(no title)"} — ${t.url}`)
          .join("\n");
      }

      case "switchTab": {
        if (!args.tabId) return "Error: tabId is required for switchTab action.";
        await session.switchTab(args.tabId);
        onProgress(`Switched to tab ${args.tabId}`);
        return `Active tab: ${args.tabId}`;
      }

      case "newTab": {
        const tabId = await session.openTab(args.url, onProgress);
        onProgress(`New tab ${tabId}`);
        return args.url
          ? `Opened new tab ${tabId} at ${args.url}`
          : `Opened new tab ${tabId}`;
      }

      case "closeTab": {
        const closing = args.tabId ?? session.getActiveTabId() ?? "active";
        await session.closeTab(args.tabId);
        onProgress(`Closed tab ${closing}`);
        return `Closed tab ${closing}`;
      }

      case "close": {
        onProgress("Closing browser...");
        await session.close();
        onProgress("Browser closed");
        return "Browser closed.";
      }

      case "waitForUser": {
        const reason =
          args.reason?.trim() ||
          "Complete the required step in the browser window, then continue.";
        await ctx.requestUserStep(reason);
        onProgress("User continued");
        return `User completed manual step: ${reason}`;
      }

      default:
        return `Error: unknown browser action: ${action}`;
    }
  } catch (err) {
    return formatBrowserError(err, { selector: args.selector, url: args.url });
  }
}
