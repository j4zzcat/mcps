import type { MethodologyRecord, MethodologySection } from "../types/methodology.js";
import { DEFAULT_WEIGHTS } from "../types/scoring.js";
import { loadHtml, normalizeWhitespace, sectionsByHeading } from "./common.js";
import { parseLabWeights } from "./lab.js";

const SECTION_KEYWORDS: Record<Exclude<MethodologySection, "all">, string[]> = {
  overview: ["overview", "introduction", "methodology"],
  scores: ["score", "wqs", "eqs", "case score"],
  effects: ["effect", "sub-effect", "sub effect"],
  probative_factor: ["probative"],
  weights: ["weight", "default"],
  case_lab: ["case lab", "lab"],
};

function filterContent(sections: Record<string, string>, section: MethodologySection): string {
  if (section === "all") return Object.entries(sections).map(([heading, body]) => `${heading}\n${body}`).join("\n\n");
  const keywords = SECTION_KEYWORDS[section] ?? [];
  const matches = Object.entries(sections).filter(([heading, body]) => {
    const haystack = `${heading} ${body}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
  return matches.map(([heading, body]) => `${heading}\n${body}`).join("\n\n");
}

export function parseMethodologyPages(
  pages: Array<{ html: string; sourceUrl: string; retrievedAt: string }>,
  section: MethodologySection = "all",
): MethodologyRecord {
  const mergedSections: Record<string, string> = {};
  let weights = DEFAULT_WEIGHTS;
  let bodyText = "";

  for (const page of pages) {
    const $ = loadHtml(page.html);
    const sections = sectionsByHeading($);
    Object.assign(mergedSections, sections);
    bodyText += `\n\n${normalizeWhitespace($("body").text())}`;
    if (/case\s+lab|weight/i.test(bodyText)) weights = parseLabWeights(page.html);
  }

  const content = filterContent(mergedSections, section) || normalizeWhitespace(bodyText);

  return {
    section,
    content:
      content ||
      "UFOe scoring methodology content was not found in the fetched pages. Default weights are included from the implementation plan.",
    weights,
    sourceUrls: pages.map((page) => page.sourceUrl),
    retrievedAt: pages.at(-1)?.retrievedAt ?? new Date().toISOString(),
  };
}
