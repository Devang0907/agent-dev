/** Compact one-line labels for tool activity in the chat UI. */
export function formatToolForDisplay(toolName: string, result: string): string {
  if (toolName === "web_search") {
    const query = result.match(/Headlines for:\s*(.+)/)?.[1]?.trim()
      ?? result.match(/Search results for:\s*(.+)/)?.[1]?.trim();
    return query ? `news: "${query}"` : "searched the web";
  }
  if (toolName === "docs") {
    const q = result.match(/^# (.+?) \(npm\)/)?.[1]
      ?? result.match(/MDN results for:\s*(.+)/)?.[1]?.trim();
    return q ? `docs: "${q}"` : "looked up docs";
  }
  if (toolName === "grep") {
    const first = result.split("\n").find((l) => l.includes(":")) ?? result.split("\n")[0];
    return first?.startsWith("Error:") ? first : `grep · ${(first ?? "").slice(0, 60)}`;
  }
  if (toolName === "git") {
    const line = result.split("\n").find((l) => l.trim()) ?? "git";
    return line.length > 80 ? line.slice(0, 80) + "…" : line;
  }
  if (toolName === "diff") {
    return result.startsWith("No changes") ? result : "generated diff";
  }
  if (toolName === "memory") {
    return result.split("\n")[0] ?? toolName;
  }
  if (toolName === "plan") {
    return result;
  }
  if (toolName === "database") {
    return result.startsWith("Error:") ? result.split("\n")[0] ?? result : "ran SQL query";
  }
  if (toolName === "verify") {
    const status = result.match(/Result: (PASSED|FAILED|COMPLETED)/)?.[1];
    return status ? `verify · ${status}` : "ran verify";
  }
  if (toolName === "mcp") {
    return result.startsWith("Error:") ? result.split("\n")[0] ?? result : "mcp call";
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
