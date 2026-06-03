import { z } from "zod";
import { SCORE_CAVEAT } from "../types/scoring.js";
import type { UfoeService } from "./service.js";

export const getSubEffectAnalysisInput = {
  caseIdOrSlug: z.string().min(1),
  subEffect: z.string().optional(),
};

export async function getSubEffectAnalysis(
  service: UfoeService,
  input: z.infer<z.ZodObject<typeof getSubEffectAnalysisInput>>,
) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  let subEffects = (caseRecord.effects ?? []).flatMap((effect) => effect.subEffects);

  if (input.subEffect) {
    const needle = input.subEffect.toLowerCase();
    subEffects = subEffects.filter(
      (subEffect) => subEffect.name.toLowerCase().includes(needle) || subEffect.subEffectId?.toLowerCase() === needle,
    );
  }

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    subEffects,
    caveat: SCORE_CAVEAT,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
