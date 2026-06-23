export type BrowserAction =
  | "open"
  | "goto"
  | "click"
  | "type"
  | "select"
  | "check"
  | "waitFor"
  | "screenshot"
  | "extract"
  | "getPageContent"
  | "close"
  | "listTabs"
  | "switchTab"
  | "newTab"
  | "closeTab"
  | "waitForUser";

export const BROWSER_INTERACTION_ACTIONS = new Set<BrowserAction>([
  "click",
  "type",
  "select",
  "check",
]);

export const BROWSER_PLAN_ALLOWED_ACTIONS = new Set<BrowserAction>([
  "open",
  "goto",
  "extract",
  "getPageContent",
  "screenshot",
  "waitFor",
  "listTabs",
  "switchTab",
  "newTab",
  "waitForUser",
]);

export const BROWSER_PLAN_BLOCKED_ACTIONS = new Set<BrowserAction>([
  "click",
  "type",
  "select",
  "check",
  "closeTab",
  "close",
]);

export interface BrowserToolArgs {
  action: BrowserAction;
  tabId?: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  timeout?: number;
  requiresApproval?: boolean;
  reason?: string;
  /** Press Enter after typing (useful for search boxes). Default true when action is type. */
  submit?: boolean;
  /** Key to press after type (default Enter when submit is true). */
  pressKey?: string;
}

export interface BrowserSettings {
  headless?: boolean;
  actionTimeoutMs?: number;
  profileDir?: string;
}

export interface TabInfo {
  tabId: string;
  url: string;
  title: string;
  active: boolean;
}
