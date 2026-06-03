import { z } from "zod";
import type { UfoeService } from "./service.js";

export const getCaseSourcesInput = {
  caseIdOrSlug: z.string().min(1),
};

export async function getCaseSources(service: UfoeService, input: z.infer<z.ZodObject<typeof getCaseSourcesInput>>) {
  const caseRecord = await service.getCase(input.caseIdOrSlug);
  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    sources: caseRecord.sources ?? [],
    investigations: caseRecord.investigations ?? [],
    documents: caseRecord.documents ?? [],
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
