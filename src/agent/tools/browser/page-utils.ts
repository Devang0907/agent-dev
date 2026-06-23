import type { Page } from "playwright";

/** Wait for DOM + a short settle period (avoid networkidle on ad-heavy sites). */
export async function waitForPageSettle(page: Page, timeout = 15000): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
  await page.waitForLoadState("load", { timeout }).catch(() => {});
  // Brief pause for JS-rendered content (search results, SPAs)
  await page.waitForTimeout(800);
}

const OVERLAY_SELECTORS = [
  "#sp-cc-accept",
  'input#sp-cc-accept',
  'button:has-text("Accept")',
  'button:has-text("Accept all")',
  'button:has-text("I agree")',
  'button:has-text("Continue shopping")',
  'button:has-text("No thanks")',
  '[data-action="a-popover-close"]',
  'button[aria-label="Close"]',
  'button:has-text("Dismiss")',
];

/** Dismiss cookie banners and sign-in popups that block interaction. */
export async function dismissCommonOverlays(page: Page): Promise<string[]> {
  const dismissed: string[] = [];
  for (const selector of OVERLAY_SELECTORS) {
    try {
      const loc = page.locator(selector).first();
      if (await loc.isVisible({ timeout: 400 })) {
        await loc.click({ timeout: 2000 });
        dismissed.push(selector);
        await page.waitForTimeout(300);
      }
    } catch {
      // not present
    }
  }
  return dismissed;
}

/** Scroll to load lazy content before extracting page text. */
export async function scrollForLazyContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = 400;
      const max = Math.min(document.body.scrollHeight, 2400);
      const timer = setInterval(() => {
        window.scrollTo(0, y);
        y += step;
        if (y >= max) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
}
