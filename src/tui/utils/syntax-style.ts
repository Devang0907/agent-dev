import { SyntaxStyle } from "@opentui/core";
import { getTheme } from "../theme/tokens.js";

let cached: SyntaxStyle | undefined;

export function getMarkdownSyntaxStyle(): SyntaxStyle {
  if (cached) return cached;
  const theme = getTheme();
  cached = SyntaxStyle.fromStyles({
    default: { fg: theme.text },
    "markup.heading": { fg: theme.primary, bold: true },
    "markup.bold": { bold: true },
    "markup.italic": { italic: true },
    "markup.raw": { fg: theme.textMuted },
    "markup.link": { fg: theme.primary, underline: true },
    "markup.list": { fg: theme.text },
    "markup.quote": { fg: theme.textMuted, italic: true },
    "punctuation": { fg: theme.textMuted },
  });
  return cached;
}
