import type { WeightSet } from "../types/scoring.js";
import { DEFAULT_WEIGHTS } from "../types/scoring.js";
import { loadHtml, normalizeWhitespace, parseNumber } from "./common.js";

function parsePercentNear(text: string, labels: string[], fallback: number): number {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const direct = [...text.matchAll(new RegExp(`${escaped}\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)\\s*%`, "gi"))];
    const directParsed = parseNumber(direct.at(-1)?.[1]);
    if (directParsed !== undefined) return directParsed;

    const nearby = [...text.matchAll(new RegExp(`${escaped}.{0,80}?(\\d+(?:\\.\\d+)?)\\s*%`, "gi"))];
    const nearbyParsed = parseNumber(nearby.at(-1)?.[1]);
    if (nearbyParsed !== undefined) return nearbyParsed;
  }
  return fallback;
}

export function parseLabWeights(html: string): WeightSet {
  const $ = loadHtml(html);
  const text = normalizeWhitespace($("body").text());

  return {
    eqs: {
      dataSensors: parsePercentNear(text, ["Instrumental", "Sensing Data", "Data Sensors"], DEFAULT_WEIGHTS.eqs.dataSensors),
      visualRecords: parsePercentNear(text, ["Visual Records", "Photo", "Video"], DEFAULT_WEIGHTS.eqs.visualRecords),
      reportsInvestigations: parsePercentNear(
        text,
        ["Reports", "Investigations", "Published Reports"],
        DEFAULT_WEIGHTS.eqs.reportsInvestigations,
      ),
    },
    wqs: {
      witnessQuantity: parsePercentNear(text, ["Witness Quantity"], DEFAULT_WEIGHTS.wqs.witnessQuantity),
      eventConditions: parsePercentNear(text, ["Event Conditions"], DEFAULT_WEIGHTS.wqs.eventConditions),
      credibilityReliability: parsePercentNear(
        text,
        ["Credibility", "Reliability"],
        DEFAULT_WEIGHTS.wqs.credibilityReliability,
      ),
    },
    final: {
      evidenceQualityScore: parsePercentNear(text, ["Evidence Quality Score", "EQS"], DEFAULT_WEIGHTS.final.evidenceQualityScore),
      witnessQualityScore: parsePercentNear(text, ["Witness Quality Score", "WQS"], DEFAULT_WEIGHTS.final.witnessQualityScore),
    },
  };
}
