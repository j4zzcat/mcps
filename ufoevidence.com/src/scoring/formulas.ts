import type { CaseScores, EffectAnalysis, WeightSet } from "../types/scoring.js";

export type WeightInput = {
  eqs?: Partial<WeightSet["eqs"]>;
  wqs?: Partial<WeightSet["wqs"]>;
  final?: Partial<WeightSet["final"]>;
};

export type NormalizedWeights = {
  weights: WeightSet;
  assumptions: string[];
};

function normalizeGroup<T extends string>(
  group: Partial<Record<T, number>>,
  fallback: Record<T, number>,
  label: string,
): { values: Record<T, number>; assumptions: string[] } {
  const merged = { ...fallback, ...group };
  const rawValues = Object.values(merged) as number[];
  const total = rawValues.reduce((sum, value) => sum + Number(value), 0);
  if (!Number.isFinite(total) || total <= 0) {
    return { values: fallback, assumptions: [`${label} weights were invalid; defaults were used.`] };
  }

  const divisor = total > 1.5 ? total : 1;
  const values = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, Number(value) / divisor]),
  ) as Record<T, number>;

  const assumptions =
    Math.abs((Object.values(values) as number[]).reduce((sum, value) => sum + value, 0) - 1) > 0.0001 || total > 1.5
      ? [`${label} weights were normalized to sum to 1.`]
      : [];

  return { values, assumptions };
}

export function normalizeWeights(input: WeightInput, defaults: WeightSet): NormalizedWeights {
  const eqs = normalizeGroup(input.eqs ?? {}, defaults.eqs, "EQS");
  const wqs = normalizeGroup(input.wqs ?? {}, defaults.wqs, "WQS");
  const final = normalizeGroup(input.final ?? {}, defaults.final, "Final score");

  return {
    weights: {
      eqs: eqs.values,
      wqs: wqs.values,
      final: final.values,
    },
    assumptions: [...eqs.assumptions, ...wqs.assumptions, ...final.assumptions],
  };
}

export function weightedAverage(values: Array<[number | undefined, number]>): number | undefined {
  let total = 0;
  let weightTotal = 0;
  for (const [value, weight] of values) {
    if (value === undefined || !Number.isFinite(value)) continue;
    total += value * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return undefined;
  return Number((total / weightTotal).toFixed(3));
}

export function scoreEffect(effect: EffectAnalysis, weights: WeightSet): CaseScores | undefined {
  const subScores = effect.subEffects
    .map((subEffect) => {
      const eqs = weightedAverage([
        [subEffect.eqs?.dataSensors, weights.eqs.dataSensors],
        [subEffect.eqs?.visualRecords, weights.eqs.visualRecords],
        [subEffect.eqs?.publishedReports, weights.eqs.reportsInvestigations],
      ]);
      const wqs = weightedAverage([
        [subEffect.wqs?.witnessQuantity, weights.wqs.witnessQuantity],
        [subEffect.wqs?.eventConditions, weights.wqs.eventConditions],
        [subEffect.wqs?.credibilityReliability, weights.wqs.credibilityReliability],
      ]);
      const caseScore = weightedAverage([
        [eqs, weights.final.evidenceQualityScore],
        [wqs, weights.final.witnessQualityScore],
      ]);
      return { evidenceQualityScore: eqs, witnessQualityScore: wqs, caseScore };
    })
    .filter((score) => score.caseScore !== undefined || score.evidenceQualityScore !== undefined || score.witnessQualityScore !== undefined);

  if (!subScores.length) return undefined;

  return {
    evidenceQualityScore: weightedAverage(subScores.map((score) => [score.evidenceQualityScore, 1])),
    witnessQualityScore: weightedAverage(subScores.map((score) => [score.witnessQualityScore, 1])),
    caseScore: weightedAverage(subScores.map((score) => [score.caseScore, 1])),
  };
}
