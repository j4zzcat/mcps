import { describe, expect, it } from "vitest";
import type { CaseRecord } from "../src/types/case.js";
import { DEFAULT_WEIGHTS } from "../src/types/scoring.js";
import { normalizeWeights } from "../src/scoring/formulas.js";
import { simulateCaseLab } from "../src/scoring/simulate.js";

describe("weight normalization", () => {
  it("normalizes percentage weights", () => {
    const normalized = normalizeWeights(
      {
        final: {
          evidenceQualityScore: 70,
          witnessQualityScore: 30,
        },
      },
      DEFAULT_WEIGHTS,
    );

    expect(normalized.weights.final.evidenceQualityScore).toBeCloseTo(0.7);
    expect(normalized.assumptions).toContain("Final score weights were normalized to sum to 1.");
  });
});

describe("case lab simulation", () => {
  it("recalculates from exposed sub-effect inputs", () => {
    const record: CaseRecord = {
      caseId: "rb-47",
      title: "RB-47",
      url: "https://ufoevidence.com/cases/rb-47",
      categories: [],
      tags: [],
      retrievedAt: "2026-06-03T00:00:00.000Z",
      scores: { caseScore: 91, evidenceQualityScore: 94, witnessQualityScore: 86 },
      effects: [
        {
          effectName: "Effects Present",
          subEffects: [
            {
              name: "Multi-sensor detection",
              eqs: {
                dataSensors: 95,
                visualRecords: 40,
                publishedReports: 90,
              },
              wqs: {
                witnessQuantity: 80,
                eventConditions: 85,
                credibilityReliability: 95,
              },
            },
          ],
        },
      ],
    };

    const simulation = simulateCaseLab(record, { weights: {} });
    expect(simulation.simulatedScores.evidenceQualityScore).toBeCloseTo(77.25);
    expect(simulation.simulatedScores.witnessQualityScore).toBeCloseTo(86.667);
    expect(simulation.simulatedScores.caseScore).toBeGreaterThan(80);
  });
});
