import type { Page } from "playwright";
import type { BrowserToolArgs } from "./types.js";

const DESTRUCTIVE_URL_PATTERNS = [
  /checkout/i,
  /payment/i,
  /pay\b/i,
  /confirm/i,
  /booking/i,
  /purchase/i,
  /order\/submit/i,
  /delete/i,
  /remove-account/i,
];

const DESTRUCTIVE_TEXT_PATTERNS = [
  /\bpay\s+now\b/i,
  /\bplace\s+order\b/i,
  /\bconfirm\s+booking\b/i,
  /\bconfirm\s+purchase\b/i,
  /\bcomplete\s+payment\b/i,
  /\bdelete\s+account\b/i,
  /\bsubmit\s+payment\b/i,
];

/** URL paths that indicate a real challenge page — not mere script references in HTML. */
const CAPTCHA_URL_PATTERNS = [
  /validatecaptcha/i,
  /robot_check/i,
  /\/errors\/validate/i,
  /are-you-a-human/i,
  /blocked.*bot/i,
];

const VISIBLE_CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  "#captchacharacters",
  'form[action*="captcha"]',
  'img[src*="captcha" i]',
  "#auth-captcha-image",
];

const VISIBLE_OTP_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[name*="otp" i]',
  'input[id*="otp" i]',
  'input[name*="mfa" i]',
  'input[placeholder*="verification code" i]',
  'input[placeholder*="one-time" i]',
];

export function isDestructiveBrowserAction(args: BrowserToolArgs): boolean {
  if (args.requiresApproval === true) return true;

  const url = args.url ?? "";
  if (url && DESTRUCTIVE_URL_PATTERNS.some((p) => p.test(url))) return true;

  const selector = args.selector ?? "";
  const text = args.text ?? args.value ?? "";
  const combined = `${selector} ${text}`;
  if (DESTRUCTIVE_TEXT_PATTERNS.some((p) => p.test(combined))) return true;

  return false;
}

export function formatBrowserPermissionCommand(args: BrowserToolArgs): string {
  const parts = [`browser ${args.action}`];
  if (args.tabId) parts.push(`tab=${args.tabId}`);
  if (args.url) parts.push(`url=${args.url}`);
  if (args.selector) parts.push(`selector=${args.selector}`);
  if (args.text) parts.push(`text=${args.text}`);
  if (args.value) parts.push(`value=${args.value}`);
  return parts.join(" ");
}

export type PageBlockerKind = "captcha" | "otp" | "payment";

export interface PageBlocker {
  kind: PageBlockerKind;
  reason: string;
}

async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.locator(selector).first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

/**
 * Detect real blockers using visible UI only.
 * Avoids false positives from "captcha" strings embedded in Amazon/Google scripts.
 */
export async function detectPageBlockers(page: Page): Promise<PageBlocker | null> {
  try {
    const url = page.url();
    if (CAPTCHA_URL_PATTERNS.some((p) => p.test(url))) {
      return {
        kind: "captcha",
        reason: "CAPTCHA or bot-check page detected. Complete it in the browser window, then press Enter to continue.",
      };
    }

    for (const selector of VISIBLE_CAPTCHA_SELECTORS) {
      if (await isVisible(page, selector)) {
        return {
          kind: "captcha",
          reason: "CAPTCHA challenge is visible. Complete it in the browser window, then press Enter to continue.",
        };
      }
    }

    for (const selector of VISIBLE_OTP_SELECTORS) {
      if (await isVisible(page, selector)) {
        return {
          kind: "otp",
          reason: "OTP or verification code field detected. Enter it in the browser or provide it when prompted.",
        };
      }
    }

    const hasCardInput = await page
      .locator(
        'input[name*="card" i]:visible, input[autocomplete="cc-number"]:visible, input[placeholder*="card number" i]:visible',
      )
      .count()
      .catch(() => 0);
    if (hasCardInput > 0) {
      return {
        kind: "payment",
        reason:
          "Payment form is visible. Enter card details manually in the browser — never share card numbers in chat.",
      };
    }
  } catch {
    // ignore detection errors
  }
  return null;
}
