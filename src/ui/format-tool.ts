/** Compact one-line labels for tool activity in the chat UI. */
export function formatToolForDisplay(toolName: string, result: string): string {
  if (toolName === "web_search") {
    const query = result.match(/Headlines for:\s*(.+)/)?.[1]?.trim()
      ?? result.match(/Search results for:\s*(.+)/)?.[1]?.trim();
    return query ? `news: "${query}"` : "searched the web";
  }
  if (toolName === "read") {
    return result.startsWith("Error:") ? result : "read file";
  }
  if (toolName === "write" || toolName === "edit") {
    return result.startsWith("Error:") ? result : result.split("\n")[0] ?? toolName;
  }
  if (toolName === "bash") {
    if (result.includes("Dev server")) {
      const first = result.split("\n").slice(0, 2).join(" · ");
      return first.length > 100 ? first.slice(0, 100) + "…" : first;
    }
    if (result.startsWith("Error:")) return result.split("\n")[0] ?? result;
    const line = result.split("\n").find((l) => l.trim()) ?? "command finished";
    return line.length > 80 ? line.slice(0, 80) + "…" : line;
  }
  return result.length > 100 ? result.slice(0, 100) + "…" : result;
}
