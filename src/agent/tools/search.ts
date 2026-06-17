import type { ToolDefinition } from "../../providers/types.js";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the internet for news, documentation, or current information",
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
  pubDate?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NEWS_QUERY_RE =
  /\b(news|headlines|breaking news|top\s+\d+\s+(news|stories|headlines)|\d+\s+news|today'?s?\s+(news|headlines|\d+\s+news))\b/i;

function isNewsQuery(query: string): boolean {
  return NEWS_QUERY_RE.test(query);
}

function headlineLimit(query: string): number {
  const top = query.match(/\btop\s+(\d+)\b/i);
  if (top) return Math.min(50, Math.max(1, parseInt(top[1]!, 10)));
  const n = query.match(/\b(\d+)\s+news\b/i);
  if (n) return Math.min(50, Math.max(1, parseInt(n[1]!, 10)));
  return 20;
}

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

function extractXmlTag(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1];
  if (cdata) return cdata.trim();
  return block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? "";
}

function parseRssItems(xml: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null && results.length < limit) {
    const block = match[1]!;
    const title = stripHtml(extractXmlTag(block, "title"));
    const url = extractXmlTag(block, "link");
    const pubDate = extractXmlTag(block, "pubDate");
    const snippet = stripHtml(extractXmlTag(block, "description")).slice(0, 200);

    if (title && url) {
      results.push({ title, url, snippet, pubDate });
    }
  }

  return results;
}

async function fetchGoogleNewsHeadlines(limit: number): Promise<SearchResult[]> {
  const url = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google News RSS failed (${res.status})`);
  return parseRssItems(await res.text(), limit);
}

async function fetchGoogleNewsSearch(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google News search RSS failed (${res.status})`);
  return parseRssItems(await res.text(), limit);
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

function isAdOrJunk(result: SearchResult): boolean {
  const url = result.url.toLowerCase();
  return (
    url.includes("ad_provider") ||
    url.includes("ad_domain") ||
    url.includes("duckduckgo.com/y.") ||
    url.length > 280
  );
}

function cleanResultUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.length > 120 ? url.slice(0, 120) + "…" : url;
  }
}

function parseTagsByClass(html: string, className: string): string[] {
  const re = new RegExp(`<a\\b[^>]*class=['"]${className}['"][^>]*>[\\s\\S]*?<\\/a>`, "gi");
  return html.match(re) ?? [];
}

function parseDdgHtmlResults(html: string): SearchResult[] {
  const linkTags = parseTagsByClass(html, "result__a");
  const snippetTags = parseTagsByClass(html, "result__snippet");
  const results: SearchResult[] = [];

  for (let i = 0; i < linkTags.length && results.length < 15; i++) {
    const tag = linkTags[i]!;
    const href = extractAttr(tag, "href");
    const title = stripHtml(tag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    const snippetTag = snippetTags[i];
    const snippet = snippetTag
      ? stripHtml(snippetTag.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""))
      : "";
    if (href && title && !isAdOrJunk({ title, url: decodeDdgUrl(href), snippet })) {
      results.push({ title, url: cleanResultUrl(decodeDdgUrl(href)), snippet });
    }
  }
  return results;
}

async function fetchDdgHtmlResults(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query, b: "", kl: "us-en" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo html failed (${res.status})`);
  return parseDdgHtmlResults(await res.text());
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchNewsResults(query: string): Promise<SearchResult[]> {
  const limit = headlineLimit(query);
  const generic =
    /\b(top\s+\d+|today'?s?\s+news|news of today|news today|latest news|breaking news)\b/i.test(query);

  let results: SearchResult[];
  if (generic) {
    results = await fetchGoogleNewsHeadlines(limit);
  } else {
    results = await fetchGoogleNewsSearch(query, limit);
    if (results.length < 5) {
      results = [...results, ...(await fetchGoogleNewsHeadlines(limit))];
    }
  }

  return dedupeResults(results).slice(0, limit);
}

async function fetchWebResults(query: string): Promise<SearchResult[]> {
  return dedupeResults(await fetchDdgHtmlResults(query)).slice(0, 12);
}

function formatNewsResults(query: string, items: SearchResult[]): string {
  const lines: string[] = [
    `Headlines for: ${query}`,
    `Source: Google News (US, ${new Date().toISOString().slice(0, 10)})`,
    "",
  ];

  if (items.length === 0) {
    lines.push("No headlines found.");
    return lines.join("\n");
  }

  for (const [i, item] of items.entries()) {
    lines.push(`${i + 1}. ${item.title}`);
    if (item.pubDate) lines.push(`   ${item.pubDate}`);
  }

  lines.push("");
  lines.push(
    "Reply with a numbered list using these exact headline titles. Add a one-line note only if a headline is unclear.",
  );
  return lines.join("\n");
}

function formatWebResults(query: string, web: SearchResult[]): string {
  const lines: string[] = [`Search results for: ${query}`, ""];

  if (web.length === 0) {
    lines.push("No results found.");
    return lines.join("\n");
  }

  for (const [i, r] of web.entries()) {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet.slice(0, 160)}`);
  }

  lines.push("");
  lines.push("Summarize the key findings for the user concisely.");
  return lines.join("\n");
}

export async function executeWebSearch(args: { query: string }): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "Error: query is required";

  try {
    if (isNewsQuery(query)) {
      const headlines = await fetchNewsResults(query);
      return formatNewsResults(query, headlines);
    }

    const web = await fetchWebResults(query);
    return formatWebResults(query, web);
  } catch (err) {
    return `Error: search failed — ${err instanceof Error ? err.message : String(err)}`;
  }
}
