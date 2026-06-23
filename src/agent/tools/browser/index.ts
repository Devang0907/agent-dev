import type { ToolDefinition } from "../../../providers/types.js";
import { executeBrowserAction } from "./actions.js";
import type { BrowserToolArgs } from "./types.js";

const BROWSER_ACTIONS = [
  "open",
  "goto",
  "click",
  "type",
  "select",
  "check",
  "waitFor",
  "screenshot",
  "extract",
  "getPageContent",
  "close",
  "listTabs",
  "switchTab",
  "newTab",
  "closeTab",
  "waitForUser",
] as const;

export const browserTool: ToolDefinition = {
  name: "browser",
  description:
    "Control a real Chromium browser for web tasks: search, forms, booking, scraping, screenshots. " +
    "Inspect pages with getPageContent before interacting. Session persists across calls. " +
    "Set requiresApproval before purchases/bookings. Use waitForUser for CAPTCHA, OTP, or payment steps.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: `Action: ${BROWSER_ACTIONS.join(" | ")}`,
        enum: [...BROWSER_ACTIONS],
      },
      tabId: {
        type: "string",
        description: "Target tab ID (default: active tab). Use listTabs to see IDs.",
      },
      url: {
        type: "string",
        description: "URL for open, goto, or newTab",
      },
      selector: {
        type: "string",
        description: "CSS selector for click, type, select, check, waitFor, extract",
      },
      text: {
        type: "string",
        description: "Text to type into an input field",
      },
      value: {
        type: "string",
        description: "Option value for select action",
      },
      timeout: {
        type: "number",
        description: "Timeout in ms for wait/action (default 30000)",
      },
      requiresApproval: {
        type: "boolean",
        description: "Set true before destructive actions (purchase, booking confirm, delete)",
      },
      reason: {
        type: "string",
        description: "Reason shown to user for waitForUser action",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

export async function executeBrowser(args: BrowserToolArgs): Promise<string> {
  return executeBrowserAction(args);
}
