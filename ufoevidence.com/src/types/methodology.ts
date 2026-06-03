import type { WeightSet } from "./scoring.js";

export type MethodologySection =
  | "overview"
  | "scores"
  | "effects"
  | "probative_factor"
  | "weights"
  | "case_lab"
  | "all";

export type MethodologyRecord = {
  section: MethodologySection | string;
  content: string;
  weights?: WeightSet;
  sourceUrls: string[];
  retrievedAt: string;
};
