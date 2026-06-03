import { z } from "zod";
import { SCORE_CAVEAT } from "../types/scoring.js";
import type { UfoeService } from "./service.js";

export const getCaseEffectsInput = {
  caseIdOrSlug: z.string().min(1),
  effectCategory: z.string().optional(),
};

export async function getCaseEffects(service: UfoeService, input: z.infer<z.ZodObject<typeof getCaseEffectsInput>>) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  const category = input.effectCategory?.toLowerCase();
  const effects = category
    ? (caseRecord.effects ?? []).filter((effect) => effect.effectCategory?.toLowerCase().includes(category))
    : (caseRecord.effects ?? []);

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    effects,
    caveat: SCORE_CAVEAT,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
