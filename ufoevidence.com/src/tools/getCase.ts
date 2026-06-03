import { z } from "zod";
import type { UfoeService } from "./service.js";

export const getCaseInput = {
  caseIdOrSlug: z.string().min(1),
  includeRawSections: z.boolean().default(false),
};

export async function getCase(service: UfoeService, input: z.infer<z.ZodObject<typeof getCaseInput>>) {
  const caseRecord = await service.getCase(input.caseIdOrSlug, input.includeRawSections);
  return {
    case: caseRecord,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
