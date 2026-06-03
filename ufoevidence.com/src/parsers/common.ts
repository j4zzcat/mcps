import type { Cheerio, CheerioAPI } from "cheerio";
import { load } from "cheerio";
import type { AnyNode, Element } from "domhandler";

export type ExtractedLink = {
  text: string;
  url: string;
};

export function loadHtml(html: string): CheerioAPI {
  return load(html);
}

export function normalizeWhitespace(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function parseNumber(text: string | undefined | null): number | undefined {
  const match = (text ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseScore(text: string | undefined | null): number | undefined {
  const parsed = parseNumber(text);
  if (parsed === undefined) return undefined;
  return parsed;
}

export function absoluteUrl(href: string | undefined | null, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export function slugFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? parsed.hostname;
  } catch {
    return url
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[?#].*$/, "") ?? url;
  }
}

export function idFromTitleOrUrl(title: string, url: string): string {
  const explicitId = `${title} ${url}`.match(/\b(?:UFOe[-\s]?)?[A-Z]{0,4}-?\d{2,5}\b/i);
  if (explicitId) return explicitId[0].replace(/\s+/g, "-");
  return slugFromUrl(url)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function extractLinks($: CheerioAPI, root: Cheerio<AnyNode>, base: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = absoluteUrl(href, base);
    if (!url) return;
    links.push({
      text: normalizeWhitespace($(el).text()) || url,
      url,
    });
  });
  return links;
}

export function collectTextUntilNextHeading($: CheerioAPI, heading: Element): string {
  const parts: string[] = [];
  let node = $(heading).next();
  while (node.length) {
    const tag = node.prop("tagName")?.toLowerCase();
    if (tag && /^h[1-6]$/.test(tag)) break;
    const text = normalizeWhitespace(node.text());
    if (text) parts.push(text);
    node = node.next();
  }
  return parts.join("\n\n");
}

export function sectionsByHeading($: CheerioAPI): Record<string, string> {
  const sections: Record<string, string> = {};
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const title = normalizeWhitespace($(el).text());
    if (!title) return;
    const text = collectTextUntilNextHeading($, el);
    if (text) sections[title] = text;
  });
  return sections;
}

export function sectionByHeading($: CheerioAPI, headingText: string): string | undefined {
  const wanted = headingText.toLowerCase();
  for (const [heading, body] of Object.entries(sectionsByHeading($))) {
    if (heading.toLowerCase().includes(wanted)) return body;
  }
  return undefined;
}

export function splitListText(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/\s*(?:,|;|\||\/|\n)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export function inferDocumentType(url: string, title = ""): "spreadsheet" | "pdf" | "doc" | "web" | "unknown" {
  const value = `${url} ${title}`.toLowerCase();
  if (/\.(xlsx?|csv)(?:$|[?#])/.test(value) || value.includes("spreadsheet")) return "spreadsheet";
  if (/\.pdf(?:$|[?#])/.test(value)) return "pdf";
  if (/\.(docx?|rtf)(?:$|[?#])/.test(value)) return "doc";
  if (value.startsWith("http")) return "web";
  return "unknown";
}

export function scoreFromLabeledText(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*(?:score)?\\s*(?:[:=]|\\()?\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)?`, "i");
  return parseScore(text.match(pattern)?.[1]);
}
