export const SCORE_CAVEAT =
  "UFOe scores measure the quantity and quality of evidence under UFOe's framework; they do not prove anomalous or nonhuman origin.";

export type ScoreTriplet = {
  caseScore?: number;
  witnessQualityScore?: number;
  evidenceQualityScore?: number;
};

export type CaseScores = ScoreTriplet & {
  effectScores?: Record<string, ScoreTriplet>;
  scoringNotes?: string[];
};

export type EffectAnalysis = {
  effectId?: string;
  effectName: string;
  effectCategory?: string;
  present?: boolean;
  score?: number;
  subEffects: SubEffectAnalysis[];
};

export type SubEffectAnalysis = {
  subEffectId?: string;
  name: string;
  findings?: string;
  wqs?: {
    witnessQuantity?: number;
    eventConditions?: number;
    credibilityReliability?: number;
    rationale?: string;
  };
  eqs?: {
    dataSensors?: number;
    visualRecords?: number;
    publishedReports?: number;
    rationale?: string;
  };
  probativeFactor?: number;
  sources?: string[];
  caveats?: string[];
};

export type WeightSet = {
  eqs: Record<"dataSensors" | "visualRecords" | "reportsInvestigations", number>;
  wqs: Record<"witnessQuantity" | "eventConditions" | "credibilityReliability", number>;
  final: Record<"evidenceQualityScore" | "witnessQualityScore", number>;
};

export const DEFAULT_WEIGHTS: WeightSet = {
  eqs: {
    dataSensors: 45,
    visualRecords: 30,
    reportsInvestigations: 25,
  },
  wqs: {
    witnessQuantity: 33.333,
    eventConditions: 33.333,
    credibilityReliability: 33.333,
  },
  final: {
    evidenceQualityScore: 65,
    witnessQualityScore: 35,
  },
};
