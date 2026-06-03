import { z } from "zod";
import { simulateCaseLab } from "../scoring/simulate.js";
import { SCORE_CAVEAT } from "../types/scoring.js";
import type { UfoeService } from "./service.js";

export const simulateCaseLabWeightsInput = {
  caseIdOrSlug: z.string().min(1),
  weights: z.object({
    eqs: z
      .object({
        dataSensors: z.number().optional(),
        visualRecords: z.number().optional(),
        reportsInvestigations: z.number().optional(),
      })
      .optional(),
    wqs: z
      .object({
        witnessQuantity: z.number().optional(),
        eventConditions: z.number().optional(),
        credibilityReliability: z.number().optional(),
      })
      .optional(),
    final: z
      .object({
        evidenceQualityScore: z.number().optional(),
        witnessQualityScore: z.number().optional(),
      })
      .optional(),
  }),
};

export async function simulateCaseLabWeights(
  service: UfoeService,
  input: z.infer<z.ZodObject<typeof simulateCaseLabWeightsInput>>,
) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  const simulation = simulateCaseLab(caseRecord, { weights: input.weights });

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    ...simulation,
    caveats: [...simulation.caveats, SCORE_CAVEAT],
    sourceUrls: [caseRecord.url],
    retrievedAt: caseRecord.retrievedAt,
  };
}
