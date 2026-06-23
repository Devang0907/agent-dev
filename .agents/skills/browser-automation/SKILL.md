---
name: browser-automation
description: Multi-step web automation with Playwright — inspect pages, interact safely, handle blockers.
---

# Browser automation

Use the `browser` tool for web tasks. Follow this loop:

## Operating loop

1. **Check tabs** — `listTabs` if unsure which tab is active.
2. **Inspect first** — call `getPageContent` after every navigation or search submit.
3. **Search** — `type` with `#twotabsearchtextbox` or `input[name="field-keywords"]` (Enter is pressed automatically). Then `getPageContent` to read the **Listings / search results** section.
4. **Verify** — `extract` or `getPageContent` after UI changes.
5. **Resnapshot** — if an action fails, run `getPageContent` again (DOM may have changed).

## Safety

- Set `requiresApproval: true` before purchases, booking confirmations, or account deletion.
- Call `waitForUser` before payment confirmation — never enter card numbers.
- If CAPTCHA, OTP, or payment fields appear, pause and ask the user to complete manually.
- In Plan mode, only read-only browser actions are allowed.

## Tab management

- `open` — launch browser + navigate (creates tab)
- `newTab` / `switchTab` / `closeTab` / `listTabs` — multi-tab workflows
- `close` — shut down browser when done

## Example: compare flight prices

1. `browser open` → airline or aggregator URL
2. `getPageContent` → find search form selectors
3. `type` origin, destination, date fields; `click` search
4. `extract` prices from results
5. Compare in your reply; ask user which option to book
6. `click` continue with `requiresApproval: true` before final purchase
7. `waitForUser` at payment step
