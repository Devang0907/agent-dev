export function formatBrowserError(err: unknown, context?: { selector?: string; url?: string }): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/Executable doesn't exist|browserType\.launch|playwright install/i.test(message)) {
    return "Error: Playwright browsers missing. Run: npx playwright install chromium";
  }

  if (/Target (page|closed)|has been closed/i.test(message)) {
    return "Error: Tab was closed. Use listTabs or open a new tab.";
  }

  if (/No browser session|Browser not launched/i.test(message)) {
    return "Error: No browser session. Call browser open first.";
  }

  if (/Timeout.*exceeded|waiting for selector/i.test(message)) {
    const sel = context?.selector ? ` \`${context.selector}\`` : "";
    return `Error: Element not found${sel}. Run getPageContent to inspect the page.`;
  }

  if (/net::ERR_|Navigation failed|NS_ERROR/i.test(message)) {
    const url = context?.url ? ` \`${context.url}\`` : "";
    return `Error: Navigation failed${url} — site may be down or blocked. (${message})`;
  }

  return `Error: ${message}`;
}
