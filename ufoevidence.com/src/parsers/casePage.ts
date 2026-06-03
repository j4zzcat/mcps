import type { CheerioAPI } from "cheerio";
import type { Investigation, CaseRecord } from "../types/case.js";
import type { CaseDocument, SourceRecord } from "../types/source.js";
import type { CaseScores, EffectAnalysis, SubEffectAnalysis } from "../types/scoring.js";
import {
  extractLinks,
  idFromTitleOrUrl,
  inferDocumentType,
  loadHtml,
  normalizeWhitespace,
  parseNumber,
  scoreFromLabeledText,
  sectionsByHeading,
  splitListText,
  uniqueStrings,
} from "./common.js";

type ParseCaseOptions = {
  html: string;
  sourceUrl: string;
  retrievedAt: string;
  includeRawSections?: boolean;
};

function titleFromPage($: CheerioAPI): string {
  return (
    normalizeWhitespace($("h1").first().text()) ||
    normalizeWhitespace($("title").text()).replace(/\s*[-|]\s*UFOevidence.*$/i, "") ||
    "Untitled UFOevidence case"
  );
}

function parseMetadata($: CheerioAPI, bodyText: string): Partial<CaseRecord> {
  const get = (label: string): string | undefined => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return bodyText.match(new RegExp(`${escaped}\\s*[:=]\\s*([^|\\n;]+)`, "i"))?.[1]?.trim();
  };

  const date = get("Date");
  const year = date?.match(/\b(18|19|20)\d{2}\b/)?.[0] ?? bodyText.match(/\b(18|19|20)\d{2}\b/)?.[0];
  const locationText = get("Location") ?? get("Place");
  const locationParts = locationText ? splitListText(locationText) : [];

  return {
    date,
    year: year ? Number(year) : undefined,
    location: locationParts.length
      ? {
          city: locationParts.length > 2 ? locationParts[0] : undefined,
          state: locationParts.length > 1 ? locationParts.at(-2) : undefined,
          country: locationParts.at(-1),
        }
      : undefined,
    status: get("Status") ?? get("Classification"),
    witnessType: get("Witness Type"),
    witnessCount: parseNumber(get("Witness Count")) ?? get("Witness Count"),
  };
}

function parseScores(bodyText: string): CaseScores {
  return {
    caseScore: scoreFromLabeledText(bodyText, "Case Score"),
    witnessQualityScore: scoreFromLabeledText(bodyText, "Witness Quality Score") ?? scoreFromLabeledText(bodyText, "WQS"),
    evidenceQualityScore: scoreFromLabeledText(bodyText, "Evidence Quality Score") ?? scoreFromLabeledText(bodyText, "EQS"),
    scoringNotes: /65%\s*EQS\s*\+\s*45%\s*WQS/i.test(bodyText)
      ? ["Methodology text may contain the known 65% EQS + 45% WQS typo; Case Lab defaults use 65% / 35%."]
      : undefined,
  };
}

function parseInvestigations(sections: Record<string, string>): Investigation[] {
  return Object.entries(sections)
    .filter(([heading]) => /investigation|corroboration/i.test(heading))
    .map(([title, rawText]) => ({ title, findings: rawText, rawText }));
}

function parseSources($: CheerioAPI, sections: Record<string, string>, sourceUrl: string): SourceRecord[] {
  const sourceHeadings = Object.entries(sections).filter(([heading]) => /source|reference|bibliography/i.test(heading));
  const records: SourceRecord[] = [];

  for (const [heading, text] of sourceHeadings) {
    const lines = text.split(/\n|(?<=\.)\s+(?=[A-Z])/).map(normalizeWhitespace).filter(Boolean);
    for (const line of lines.length ? lines : [text]) {
      records.push({
        sourceId: `source-${records.length + 1}`,
        title: line.replace(/^[-*]\s*/, "").slice(0, 240),
        rawText: line,
        type: heading,
        year: line.match(/\b(18|19|20)\d{2}\b/)?.[0],
      });
    }
  }

  const sourceLinks = extractLinks($, $("body"), sourceUrl).filter((link) => /source|report|pdf|doc|archive|http/i.test(link.text + link.url));
  for (const link of sourceLinks) {
    const existing = records.find((record) => record.url === link.url);
    if (existing) continue;
    records.push({
      sourceId: `source-${records.length + 1}`,
      title: link.text,
      url: link.url,
      type: inferDocumentType(link.url, link.text),
    });
  }

  return records;
}

function parseDocuments($: CheerioAPI, sourceUrl: string): CaseDocument[] {
  return extractLinks($, $("body"), sourceUrl)
    .map((link): CaseDocument => ({
      title: link.text,
      url: link.url,
      type: inferDocumentType(link.url, link.text),
    }))
    .filter((doc) => doc.type !== "web" || /spreadsheet|score|pdf|document|report|source/i.test(`${doc.title} ${doc.url}`));
}

function parseSubEffectText(name: string, text: string): SubEffectAnalysis {
  return {
    name,
    findings: text,
    wqs: {
      witnessQuantity: scoreFromLabeledText(text, "Witness Quantity"),
      eventConditions: scoreFromLabeledText(text, "Event Conditions"),
      credibilityReliability:
        scoreFromLabeledText(text, "Credibility / Reliability") ?? scoreFromLabeledText(text, "Credibility"),
      rationale: text.match(/(?:WQS rationale|Witness rationale)\s*[:=]\s*(.+)/i)?.[1],
    },
    eqs: {
      dataSensors: scoreFromLabeledText(text, "Instrumental / Sensing Data") ?? scoreFromLabeledText(text, "Data Sensors"),
      visualRecords: scoreFromLabeledText(text, "Visual Records"),
      publishedReports: scoreFromLabeledText(text, "Reports / Investigations") ?? scoreFromLabeledText(text, "Published Reports"),
      rationale: text.match(/(?:EQS rationale|Evidence rationale)\s*[:=]\s*(.+)/i)?.[1],
    },
    probativeFactor: scoreFromLabeledText(text, "Probative Factor"),
    sources: splitListText(text.match(/Sources?\s*[:=]\s*([^.;]+)/i)?.[1] ?? ""),
  };
}

function parseEffects(sections: Record<string, string>): EffectAnalysis[] {
  const effects: EffectAnalysis[] = [];

  for (const [heading, text] of Object.entries(sections)) {
    if (!/effect|sub-effect|sub effect/i.test(`${heading} ${text}`)) continue;

    const subEffects: SubEffectAnalysis[] = [];
    const subMatches = [...text.matchAll(/(?:Sub[-\s]?effect|Effect)\s*[:=]\s*([^.;\n]+)[.;\n]\s*([^]*?)(?=(?:Sub[-\s]?effect|Effect)\s*[:=]|$)/gi)];

    if (subMatches.length) {
      for (const match of subMatches) {
        subEffects.push(parseSubEffectText(normalizeWhitespace(match[1]), normalizeWhitespace(match[2])));
      }
    } else {
      subEffects.push(parseSubEffectText(heading, text));
    }

    effects.push({
      effectId: heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      effectName: heading,
      present: !/\bnot present\b|\babsent\b/i.test(text),
      score: scoreFromLabeledText(text, "Effect Score") ?? scoreFromLabeledText(text, "Score"),
      subEffects,
    });
  }

  return effects;
}

export function parseCasePage({ html, sourceUrl, retrievedAt, includeRawSections = false }: ParseCaseOptions): CaseRecord {
  const $ = loadHtml(html);
  const bodyText = normalizeWhitespace($("body").text());
  const sections = sectionsByHeading($);
  const title = titleFromPage($);
  const subtitle = normalizeWhitespace($("h2,.subtitle,.dek").first().text()) || undefined;
  const metadata = parseMetadata($, bodyText);
  const categoryText = normalizeWhitespace($(".category,.categories,[data-category]").text());
  const tagText = normalizeWhitespace($(".tag,.tags,[data-tag]").text());
  const summary =
    sections.Summary ??
    Object.entries(sections).find(([heading]) => /summary|overview|case/i.test(heading))?.[1] ??
    normalizeWhitespace($("main p, article p, body p").first().text());

  return {
    caseId: idFromTitleOrUrl(title, sourceUrl),
    title,
    url: sourceUrl,
    subtitle,
    summary,
    keyQuote: normalizeWhitespace($("blockquote").first().text()) || undefined,
    categories: uniqueStrings(splitListText(categoryText)),
    tags: splitListText(tagText),
    ...metadata,
    scores: parseScores(bodyText),
    effects: parseEffects(sections),
    investigations: parseInvestigations(sections),
    sources: parseSources($, sections, sourceUrl),
    documents: parseDocuments($, sourceUrl),
    rawSections: includeRawSections ? sections : undefined,
    retrievedAt,
  };
}
