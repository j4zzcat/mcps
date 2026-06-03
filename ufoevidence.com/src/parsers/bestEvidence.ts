import type { CaseSummary } from "../types/case.js";
import { parseCasesIndex } from "./casesIndex.js";

export function parseBestEvidence(html: string, sourceUrl: string): CaseSummary[] {
  return parseCasesIndex({ html, sourceUrl, defaultCategory: "Best Evidence" }).sort((a, b) => {
    return (b.caseScore ?? -Infinity) - (a.caseScore ?? -Infinity);
  });
}
