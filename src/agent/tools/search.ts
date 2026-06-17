import type { ToolDefinition } from "../../providers/types.js";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the internet for current information, documentation, or news",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function stripHtml(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}=['"]([^'"]*)['"]`, "i");
  return tag.match(re)?.[1] ?? null;
}

function decodeDdgUrl(href: string): string {
  try {
    const match = href.match(/uddg=([^&]+)/);
    if (match) return decodeURIComponent(match[1]!);
    if (href.startsWith("//")) return `https:${href}`;
    return href;
  } catch {
    return href;
  }
}

function parseTagsByClass(html: string, className: string): string[] {
  const re = new RegExp(`<a\\b[^>]*class=['"]${className}['"][^>]*>[\\s\\S]*?<\\/a>`, "gi");
  return html.match(re) ?? [];
}

function parseDdgLiteHtml(html: string): SearchResult[] {
  const linkTags = parseTagsByClass(html, "result-link");
  const snippetRe = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
  const snippets: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = snippetRe.exec(html)) !== null) {
    snippets.push(stripHtml(match[1]!));
  }

  const results: SearchResult[] = [];
  for (let i = 0; i < linkTags.length && results.length < 8; i++) {
    const tag = linkTags[i]!;
    const href = extractAttr(tag, "href");
    const title = stripHtml(tag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    if (href && title) {
      results.push({
        title,
        url: decodeDdgUrl(href),
        snippet: snippets[i] ?? "",
      });
    }
  }
  return results;
}

function parseDdgHtmlResults(html: string): SearchResult[] {
  const linkTags = parseTagsByClass(html, "result__a");
  const snippetTags = parseTagsByClass(html, "result__snippet");

  const results: SearchResult[] = [];
  for (let i = 0; i < linkTags.length && results.length < 8; i++) {
    const tag = linkTags[i]!;
    const href = extractAttr(tag, "href");
    const title = stripHtml(tag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    const snippetTag = snippetTags[i];
    const snippet = snippetTag
      ? stripHtml(snippetTag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""))
      : "";
    if (href && title) {
      results.push({ title, url: decodeDdgUrl(href), snippet });
    }
  }
  return results;
}

async function fetchDdgLiteResults(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo lite failed (${res.status})`);
  return parseDdgLiteHtml(await res.text());
}

async function fetchDdgHtmlResults(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query, b: "", kl: "" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo html failed (${res.status})`);
  return parseDdgHtmlResults(await res.text());
}

async function fetchWebResults(query: string): Promise<SearchResult[]> {
  const lite = await fetchDdgLiteResults(query);
  if (lite.length > 0) return lite;
  return fetchDdgHtmlResults(query);
}

async function fetchDdgInstantAnswer(query: string): Promise<string | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "agent-dev/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<
      { Text?: string; FirstURL?: string } | { Topics?: Array<{ Text?: string; FirstURL?: string }> }
    >;
  };

  const parts: string[] = [];
  if (data.AbstractText) {
    parts.push(data.Heading ? `${data.Heading}: ${data.AbstractText}` : data.AbstractText);
    if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
  }

  for (const topic of data.RelatedTopics ?? []) {
    if ("Text" in topic && topic.Text) {
      parts.push(topic.Text);
      if (topic.FirstURL) parts.push(`  ${topic.FirstURL}`);
    } else if ("Topics" in topic && topic.Topics) {
      for (const sub of topic.Topics) {
        if (sub.Text) parts.push(sub.Text);
      }
    }
    if (parts.length >= 6) break;
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function formatResults(query: string, instant: string | null, web: SearchResult[]): string {
  const lines: string[] = [`Search results for: ${query}`, ""];

  if (instant) {
    lines.push("Instant answer:", instant, "");
  }

  if (web.length === 0) {
    lines.push(instant ? "(No additional web results.)" : "No results found.");
    return lines.join("\n");
  }

  lines.push("Web results:");
  for (const [i, r] of web.entries()) {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function executeWebSearch(args: { query: string }): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "Error: query is required";

  try {
    const [instant, web] = await Promise.all([
      fetchDdgInstantAnswer(query).catch(() => null),
      fetchWebResults(query),
    ]);
    return formatResults(query, instant, web);
  } catch (err) {
    return `Error: search failed — ${err instanceof Error ? err.message : String(err)}`;
  }
}
