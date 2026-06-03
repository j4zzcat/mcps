import { z } from "zod";
import { lexicalScore } from "./common.js";
import type { UfoeService } from "./service.js";

export const CLAIM_TRACE_CAVEAT =
  "This traces the claim to UFOevidence.com text and listed sources; it does not independently verify the claim.";

export const traceCaseClaimInput = {
  caseIdOrSlug: z.string().min(1),
  claim: z.string().min(1),
};

export async function traceCaseClaim(service: UfoeService, input: z.infer<z.ZodObject<typeof traceCaseClaimInput>>) {
  const caseRecord = await service.getCase(input.caseIdOrSlug, true);
  const sections = Object.entries(caseRecord.rawSections ?? {});

  const matchedSections = sections
    .map(([sectionTitle, text]) => ({
      sectionTitle,
      text,
      sourceRefs: (caseRecord.sources ?? [])
        .filter((source) => source.rawText && text.includes(source.rawText))
        .map((source) => source.sourceId ?? source.title ?? "")
        .filter(Boolean),
      relatedSubEffects: (caseRecord.effects ?? [])
        .flatMap((effect) => effect.subEffects)
        .filter((subEffect) => text.includes(subEffect.name))
        .map((subEffect) => subEffect.name),
      score: lexicalScore(`${sectionTitle} ${text}`, input.claim),
    }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((section) => ({
      sectionTitle: section.sectionTitle,
      text: section.text,
      sourceRefs: section.sourceRefs,
      relatedSubEffects: section.relatedSubEffects,
    }));

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    matchedSections,
    sources: caseRecord.sources ?? [],
    caveat: CLAIM_TRACE_CAVEAT,
    sourceUrl: caseRecord.url,
    retrievedAt: caseRecord.retrievedAt,
  };
}
