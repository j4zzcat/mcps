import { z } from "zod";
import { lexicalScore } from "./common.js";
import type { UfoeService } from "./service.js";

export const searchCasesInput = {
  query: z.string().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  decade: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minCaseScore: z.number().optional(),
  maxCaseScore: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
};

export async function searchCases(service: UfoeService, input: z.infer<z.ZodObject<typeof searchCasesInput>>) {
  const index = await service.getCaseIndex();
  let results = index.results;

  if (input.query) {
    results = results
      .map((item) => ({
        item,
        score: lexicalScore(`${item.title} ${item.caseId} ${item.tags.join(" ")} ${item.categories.join(" ")}`, input.query ?? ""),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  if (input.category) {
    const category = input.category.toLowerCase();
    results = results.filter((item) => item.categories.some((value) => value.toLowerCase().includes(category)));
  }

  if (input.country) {
    const country = input.country.toLowerCase();
    results = results.filter((item) => item.location?.country?.toLowerCase().includes(country));
  }

  if (input.decade) {
    const decadeStart = Number(input.decade.replace(/[^0-9]/g, ""));
    if (Number.isFinite(decadeStart)) {
      results = results.filter((item) => item.year !== undefined && item.year >= decadeStart && item.year < decadeStart + 10);
    }
  }

  if (input.tags?.length) {
    const tags = input.tags.map((tag) => tag.toLowerCase());
    results = results.filter((item) => tags.every((tag) => item.tags.some((value) => value.toLowerCase().includes(tag))));
  }

  if (input.minCaseScore !== undefined) results = results.filter((item) => (item.caseScore ?? -Infinity) >= input.minCaseScore!);
  if (input.maxCaseScore !== undefined) results = results.filter((item) => (item.caseScore ?? Infinity) <= input.maxCaseScore!);

  const paged = results.slice(input.offset, input.offset + input.limit);
  return {
    results: paged,
    count: results.length,
    sourceUrl: index.sourceUrl,
    retrievedAt: index.retrievedAt,
  };
}
