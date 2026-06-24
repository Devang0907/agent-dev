import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { getBrowserProfilesDir } from "../../../config/paths.js";
import type { BrowserSettings, TabInfo } from "./types.js";
import { formatBrowserError } from "./errors.js";

const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

interface TabEntry {
  page: Page;
  url: string;
  title: string;
}

export class BrowserSession {
  private context: BrowserContext | null = null;
  private tabs = new Map<string, TabEntry>();
  private nextTabNum = 1;
  private activeTabId: string | null = null;
  private readonly profileDir: string;
  private readonly settings: BrowserSettings;

  constructor(sessionId: string, settings: BrowserSettings = {}) {
    this.settings = settings;
    this.profileDir = settings.profileDir ?? join(getBrowserProfilesDir(), sessionId);
    mkdirSync(this.profileDir, { recursive: true });
  }

  get isOpen(): boolean {
    return this.context !== null;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  async ensureBrowser(onProgress?: (msg: string) => void): Promise<void> {
    if (this.context) return;
    onProgress?.("Launching browser...");
    try {
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        headless: this.settings.headless ?? false,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/New_York",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        args: ["--disable-blink-features=AutomationControlled"],
        ignoreDefaultArgs: ["--enable-automation"],
      });
      await this.context.addInitScript(STEALTH_INIT_SCRIPT);
    } catch (err) {
      throw new Error(formatBrowserError(err));
    }
  }

  private makeTabId(): string {
    return `tab-${this.nextTabNum++}`;
  }

  private async refreshTabMeta(tabId: string): Promise<void> {
    const entry = this.tabs.get(tabId);
    if (!entry) return;
    try {
      entry.url = entry.page.url();
      entry.title = await entry.page.title();
    } catch {
      entry.url = "";
      entry.title = "";
    }
  }

  async openTab(url?: string, onProgress?: (msg: string) => void): Promise<string> {
    await this.ensureBrowser(onProgress);
    if (!this.context) throw new Error("Error: No browser session. Call browser open first.");

    const page = await this.context.newPage();
    const tabId = this.makeTabId();
    this.tabs.set(tabId, { page, url: "", title: "" });
    this.activeTabId = tabId;

    if (url) {
      onProgress?.(`Navigating to ${url}...`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await this.refreshTabMeta(tabId);
    }

    return tabId;
  }

  resolvePage(tabId?: string): Page {
    const id = tabId ?? this.activeTabId;
    if (!id) throw new Error("Error: No active tab. Call browser open or newTab first.");
    const entry = this.tabs.get(id);
    if (!entry) throw new Error(`Error: Tab not found: ${id}. Use listTabs to see open tabs.`);
    return entry.page;
  }

  async switchTab(tabId: string): Promise<void> {
    if (!this.tabs.has(tabId)) {
      throw new Error(`Error: Tab not found: ${tabId}. Use listTabs to see open tabs.`);
    }
    this.activeTabId = tabId;
    await this.tabs.get(tabId)!.page.bringToFront();
  }

  async listTabs(): Promise<TabInfo[]> {
    const result: TabInfo[] = [];
    for (const [tabId, entry] of this.tabs) {
      await this.refreshTabMeta(tabId);
      result.push({
        tabId,
        url: entry.url,
        title: entry.title,
        active: tabId === this.activeTabId,
      });
    }
    return result;
  }

  async closeTab(tabId?: string): Promise<void> {
    const id = tabId ?? this.activeTabId;
    if (!id) return;
    const entry = this.tabs.get(id);
    if (!entry) throw new Error(`Error: Tab not found: ${id}`);
    await entry.page.close();
    this.tabs.delete(id);
    if (this.activeTabId === id) {
      const remaining = [...this.tabs.keys()];
      this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
    }
  }

  async close(): Promise<void> {
    for (const [, entry] of this.tabs) {
      await entry.page.close().catch(() => {});
    }
    this.tabs.clear();
    this.activeTabId = null;
    await this.context?.close().catch(() => {});
    this.context = null;
  }

  defaultTimeout(override?: number): number {
    return override ?? this.settings.actionTimeoutMs ?? 30000;
  }
}

const sessions = new Map<string, BrowserSession>();

export function getBrowserSession(sessionId: string, settings?: BrowserSettings): BrowserSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = new BrowserSession(sessionId, settings);
    sessions.set(sessionId, session);
  }
  return session;
}

export async function closeBrowserSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) {
    await session.close();
    sessions.delete(sessionId);
  }
}

export async function closeAllBrowserSessions(): Promise<void> {
  for (const [id, session] of sessions) {
    await session.close().catch(() => {});
    sessions.delete(id);
  }
}
