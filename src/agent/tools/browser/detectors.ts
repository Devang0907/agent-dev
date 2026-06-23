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

const CAPTCHA_PATTERNS = [
  /recaptcha/i,
  /hcaptcha/i,
  /\bcaptcha\b/i,
  /challenge-form/i,
  /cf-turnstile/i,
];

const OTP_PATTERNS = [
  /verification\s+code/i,
  /one[- ]time/i,
  /\botp\b/i,
  /\b2fa\b/i,
  /two[- ]factor/i,
  /enter\s+the\s+code/i,
];

const PAYMENT_FIELD_PATTERNS = [
  /card[-_]?number/i,
  /cvv/i,
  /cvc/i,
  /expir/i,
  /credit[-_]?card/i,
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

export async function detectPageBlockers(page: Page): Promise<PageBlocker | null> {
  try {
    const html = await page.content();
    const lower = html.toLowerCase();

    if (CAPTCHA_PATTERNS.some((p) => p.test(lower))) {
      return {
        kind: "captcha",
        reason: "CAPTCHA detected on page. Complete it in the browser window, then continue.",
      };
    }

    if (OTP_PATTERNS.some((p) => p.test(lower))) {
      return {
        kind: "otp",
        reason: "OTP or verification code required. Enter it in the browser or provide it when prompted.",
      };
    }

    if (PAYMENT_FIELD_PATTERNS.some((p) => p.test(lower))) {
      const hasCardInput = await page
        .locator(
          'input[name*="card" i], input[autocomplete="cc-number"], input[placeholder*="card" i]',
        )
        .count()
        .catch(() => 0);
      if (hasCardInput > 0) {
        return {
          kind: "payment",
          reason: "Payment details required. Enter card information manually in the browser — never share card numbers in chat.",
        };
      }
    }
  } catch {
    // ignore detection errors
  }
  return null;
}
