import { z } from "zod";
import { SCORE_CAVEAT } from "../types/scoring.js";
import type { UfoeService } from "./service.js";

export const getCaseScoreInput = {
  caseIdOrSlug: z.string().min(1),
};

export async function getCaseScore(service: UfoeService, input: z.infer<z.ZodObject<typeof getCaseScoreInput>>) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    scores: caseRecord.scores ?? {},
    caveat: SCORE_CAVEAT,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
