import { UfoeToolError } from "../types/errors.js";
import type { CaseRecord } from "../types/case.js";
import type { CaseScores } from "../types/scoring.js";
import { DEFAULT_WEIGHTS } from "../types/scoring.js";
import { normalizeWeights, scoreEffect, weightedAverage, type WeightInput } from "./formulas.js";

export type SimulateInput = {
  weights: WeightInput;
};

export type SimulateOutput = {
  originalScores: CaseScores;
  simulatedScores: CaseScores;
  assumptions: string[];
  caveats: string[];
};

export function simulateCaseLab(caseRecord: CaseRecord, input: SimulateInput): SimulateOutput {
  const effects = caseRecord.effects ?? [];
  if (!effects.some((effect) => effect.subEffects.some((sub) => sub.eqs || sub.wqs))) {
    throw new UfoeToolError(
      "INSUFFICIENT_DATA",
      "Cannot simulate Case Lab weights because this case page does not expose sub-effect WQS/EQS component inputs.",
      caseRecord.url,
    );
  }

  const normalized = normalizeWeights(input.weights, DEFAULT_WEIGHTS);
  const effectScores = Object.fromEntries(
    effects
      .map((effect) => [effect.effectName, scoreEffect(effect, normalized.weights)] as const)
      .filter((entry): entry is readonly [string, CaseScores] => Boolean(entry[1])),
  );

  const simulatedScores: CaseScores = {
    effectScores,
    evidenceQualityScore: weightedAverage(Object.values(effectScores).map((score) => [score.evidenceQualityScore, 1])),
    witnessQualityScore: weightedAverage(Object.values(effectScores).map((score) => [score.witnessQualityScore, 1])),
  };

  simulatedScores.caseScore = weightedAverage([
    [simulatedScores.evidenceQualityScore, normalized.weights.final.evidenceQualityScore],
    [simulatedScores.witnessQualityScore, normalized.weights.final.witnessQualityScore],
  ]);

  return {
    originalScores: caseRecord.scores ?? {},
    simulatedScores,
    assumptions: normalized.assumptions,
    caveats: [
      "Simulation uses only sub-effect component scores exposed in parsed page HTML.",
      "It may not exactly reproduce UFOe Case Lab when page-level inputs or spreadsheet-only adjustments are unavailable.",
    ],
  };
}
