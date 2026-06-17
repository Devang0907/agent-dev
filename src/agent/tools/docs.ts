import type { ToolDefinition } from "../../providers/types.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; agent-dev/1.0; +https://github.com/Devang0907/agent-dev)";

export const docsTool: ToolDefinition = {
  name: "docs",
  description:
    "Look up documentation: npm package README, MDN web docs, or fetch a docs URL. Use for API references and library usage.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Package name, topic, or search terms" },
      source: {
        type: "string",
        description: "npm | mdn | url (default: auto-detect from query)",
      },
      url: { type: "string", description: "Direct URL when source is url" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, max = 30_000): string {
  return text.length > max ? text.slice(0, max) + "\n... (truncated)" : text;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchNpmReadme(packageName: string): Promise<string> {
  const metaRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!metaRes.ok) throw new Error(`Package not found: ${packageName}`);
  const meta = (await metaRes.json()) as { versions?: Record<string, { dist?: { tarball?: string } }> };
  const versions = Object.keys(meta.versions ?? {}).sort();
  const latest = versions[versions.length - 1];
  const tarball = meta.versions?.[latest!]?.dist?.tarball;
  if (!tarball) throw new Error("No tarball for package");

  const readmeUrl = `https://unpkg.com/${packageName}@${latest}/README.md`;
  try {
    const readme = await fetchText(readmeUrl);
    return truncate(`# ${packageName} (npm)\n\n${readme}`);
  } catch {
    return truncate(`# ${packageName}\n\nLatest version: ${latest}\nRegistry: https://www.npmjs.com/package/${packageName}`);
  }
}

async function fetchMdn(query: string): Promise<string> {
  const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MDN search failed (${res.status})`);
  const data = (await res.json()) as {
    documents?: Array<{ title?: string; mdn_url?: string; summary?: string }>;
  };
  const docs = data.documents ?? [];
  if (docs.length === 0) return `No MDN results for: ${query}`;

  const lines = [`MDN results for: ${query}`, ""];
  for (const [i, doc] of docs.slice(0, 8).entries()) {
    lines.push(`${i + 1}. ${doc.title ?? "Untitled"}`);
    if (doc.mdn_url) lines.push(`   https://developer.mozilla.org${doc.mdn_url}`);
    if (doc.summary) lines.push(`   ${stripHtml(doc.summary).slice(0, 200)}`);
  }
  return lines.join("\n");
}

async function fetchUrlDocs(url: string): Promise<string> {
  const text = await fetchText(url);
  if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    return truncate(text);
  }
  return truncate(stripHtml(text));
}

export async function executeDocs(args: {
  query: string;
  source?: string;
  url?: string;
}): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "Error: query is required";

  let source = args.source?.trim().toLowerCase();
  if (!source) {
    if (args.url || /^https?:\/\//i.test(query)) source = "url";
    else if (/^[a-z0-9@._/-]+$/i.test(query) && !query.includes(" ")) source = "npm";
    else source = "mdn";
  }

  try {
    if (source === "url") {
      const target = args.url?.trim() || query;
      return await fetchUrlDocs(target);
    }
    if (source === "npm") {
      return await fetchNpmReadme(query.replace(/^npm\s+/i, ""));
    }
    if (source === "mdn") {
      return await fetchMdn(query);
    }
    return `Error: unknown source "${source}". Use npm, mdn, or url.`;
  } catch (err) {
    return `Error: docs lookup failed — ${err instanceof Error ? err.message : String(err)}`;
  }
}
