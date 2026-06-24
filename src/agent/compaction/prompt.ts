export const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;

export function buildSummarizationPrompt(input: {
  previousSummary?: string;
  customInstructions?: string;
}): string {
  const anchor = input.previousSummary
    ? [
        "Update the anchored summary below using the conversation history above.",
        "Preserve still-true details, remove stale details, and merge in the new facts.",
        "<previous-summary>",
        input.previousSummary,
        "</previous-summary>",
      ].join("\n")
    : "Create a new anchored summary from the conversation history above.";

  const parts = [anchor, SUMMARY_TEMPLATE];
  if (input.customInstructions?.trim()) {
    parts.push(`Additional focus from user:\n${input.customInstructions.trim()}`);
  }
  return parts.join("\n\n");
}

export const SUMMARIZATION_SYSTEM_PROMPT =
  "You are a conversation summarizer for a coding agent. Summarize the conversation history for continuation. Reply with only the structured summary — no preamble.";
