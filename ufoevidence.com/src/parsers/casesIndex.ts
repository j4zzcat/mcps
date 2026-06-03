import type { CheerioAPI } from "cheerio";
import type { CaseSummary } from "../types/case.js";
import {
  absoluteUrl,
  idFromTitleOrUrl,
  loadHtml,
  normalizeWhitespace,
  parseScore,
  scoreFromLabeledText,
  splitListText,
  uniqueStrings,
} from "./common.js";

type ParseOptions = {
  html: string;
  sourceUrl: string;
  defaultCategory?: string;
};

function extractYear(text: string): number | undefined {
  const match = text.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function extractDate(text: string): string | undefined {
  const monthDate = text.match(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+(?:18|19|20)\d{2}\b/i,
  );
  if (monthDate) return normalizeWhitespace(monthDate[0]);
  return extractYear(text)?.toString();
}

function extractLocation(rowText: string): CaseSummary["location"] | undefined {
  const locationMatch = rowText.match(/(?:Location|Place)\s*[:=]\s*([^|;\n]+)/i);
  if (!locationMatch) return undefined;
  const parts = splitListText(locationMatch[1]);
  if (!parts.length) return undefined;
  return {
    city: parts.length > 2 ? parts[0] : undefined,
    state: parts.length > 1 ? parts.at(-2) : undefined,
    country: parts.at(-1),
  };
}

function isLikelyCaseUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    if (/^\/case\/[^/]+\/?$/i.test(pathname)) return true;
    if (/^\/cases\/[^/?#]+\/?$/i.test(pathname)) return true;
  } catch {
    return false;
  }
  return false;
}

function firstText($: CheerioAPI, root: any, selectors: string): string | undefined {
  const text = normalizeWhitespace($(root).find(selectors).first().text());
  return text || undefined;
}

function listText($: CheerioAPI, root: any, selectors: string): string[] {
  return $(root)
    .find(selectors)
    .map((_, el) => normalizeWhitespace($(el).text()))
    .get()
    .filter(Boolean);
}

function extractLiveDate($: CheerioAPI, root: any, fallbackText: string): { date?: string; year?: number } {
  const year = parseScore($(root).find(".case-list-date-year,.case-slick-date-year,.case-sc-date-year").first().text());
  const monthDay = normalizeWhitespace($(root).find(".case-list-date-month,.case-slick-date-month,.case-sc-date-month").first().text());
  if (year) return { date: monthDay ? `${monthDay} ${year}` : year.toString(), year };
  return { date: extractDate(fallbackText), year: extractYear(fallbackText) };
}

function extractLiveLocation($: CheerioAPI, root: any, fallbackText: string): CaseSummary["location"] | undefined {
  const pills = $(root)
    .find(".case-list-pill,.case-slick-pill,.case-sc-pill")
    .map((_, el) => normalizeWhitespace($(el).text()))
    .get()
    .filter(Boolean);

  if (pills.length) {
    return {
      country: pills[0],
      state: pills[1],
      city: pills[2],
    };
  }

  return extractLocation(fallbackText);
}

function parseCard($: CheerioAPI, element: any, sourceUrl: string, defaultCategory?: string): CaseSummary | undefined {
  const root = $(element);
  const link = root.find("a[href]").first();
  const href = link.attr("href") ?? root.attr("href");
  const url = absoluteUrl(href, sourceUrl);
  if (!url) return undefined;
  if (!isLikelyCaseUrl(url)) return undefined;

  const cardRoot = root.is("a.case-list-item-inner,a.case-slick-item-inner,a.case-sc-item-inner") ? root.parent() : root;
  const cardText = normalizeWhitespace(cardRoot.text());

  const title =
    firstText($, cardRoot, ".case-list-title,.case-slick-title,.case-sc-title,.case-title") ||
    normalizeWhitespace(link.text()) ||
    normalizeWhitespace(root.find("h1,h2,h3,h4,strong").first().text()) ||
    normalizeWhitespace(root.text()).slice(0, 120);

  if (!title || /^(read more|details|view)$/i.test(title)) return undefined;

  const text = cardText || normalizeWhitespace(root.text());
  const caseScore =
    parseScore(cardRoot.find(".case-list-score-text,.case-slick-score-text,.case-sc-score-text,[data-score],.score").first().text()) ??
    scoreFromLabeledText(text, "Case Score") ??
    scoreFromLabeledText(text, "Score");

  const wqs = scoreFromLabeledText(text, "Witness Quality");
  const eqs = scoreFromLabeledText(text, "Evidence Quality");
  const categories = listText($, cardRoot, ".case-list-categories a,.case-slick-categories a,.case-sc-categories a,.category,.categories,[data-category]");
  const tags = listText($, cardRoot, ".case-list-tags a,.case-slick-tags a,.case-sc-tags a,.tag,.tags,[data-tag]");
  const date = extractLiveDate($, cardRoot, text);

  return {
    caseId: idFromTitleOrUrl(title, url),
    title,
    url,
    date: date.date,
    year: date.year,
    location: extractLiveLocation($, cardRoot, text),
    categories: uniqueStrings([defaultCategory, ...categories.flatMap(splitListText)]),
    tags: tags.flatMap(splitListText),
    status: text.match(/\b(?:Status|Classification)\s*[:=]\s*([^|;\n]+)/i)?.[1]?.trim(),
    caseScore,
    witnessQualityScore: wqs,
    evidenceQualityScore: eqs,
  };
}

function dedupeCases(cases: CaseSummary[]): CaseSummary[] {
  const byUrl = new Map<string, CaseSummary>();
  for (const item of cases) {
    const existing = byUrl.get(item.url);
    if (!existing) {
      byUrl.set(item.url, item);
      continue;
    }

    byUrl.set(item.url, {
      ...existing,
      ...item,
      title: item.title.length > existing.title.length ? item.title : existing.title,
      date: item.date ?? existing.date,
      year: item.year ?? existing.year,
      location: {
        ...existing.location,
        ...item.location,
      },
      categories: uniqueStrings([...existing.categories, ...item.categories]),
      tags: uniqueStrings([...existing.tags, ...item.tags]),
      caseScore: item.caseScore ?? existing.caseScore,
      witnessQualityScore: item.witnessQualityScore ?? existing.witnessQualityScore,
      evidenceQualityScore: item.evidenceQualityScore ?? existing.evidenceQualityScore,
    });
  }
  return [...byUrl.values()];
}

export function parseCasesIndex({ html, sourceUrl, defaultCategory }: ParseOptions): CaseSummary[] {
  const $ = loadHtml(html);
  const candidates: CaseSummary[] = [];

  $("a.case-list-item-inner,a.case-slick-item-inner,a.case-sc-item-inner,article,.case-list-item,.case-slick-item,.case-sc-item,.case-card,.case-item,li,tr").each((_, el) => {
    const parsed = parseCard($, el, sourceUrl, defaultCategory);
    if (parsed) candidates.push(parsed);
  });

  if (!candidates.length) {
    $("a[href]").each((_, el) => {
      const parsed = parseCard($, el, sourceUrl, defaultCategory);
      if (parsed) candidates.push(parsed);
    });
  }

  return dedupeCases(candidates).filter((item) => item.title.length > 2);
}
