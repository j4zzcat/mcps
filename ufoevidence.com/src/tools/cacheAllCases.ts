import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { UfoeService } from "./service.js";
import { cacheCaseRecord } from "./cacheCase.js";

export const cacheAllCasesInput = {};

export async function cacheAllCases(
  service: UfoeService,
  prisma: PrismaClient,
  input: z.infer<z.ZodObject<typeof cacheAllCasesInput>>,
) {
  void input;

  const index = await service.getCaseIndex();
  const results = [];

  for (const item of index.results) {
    results.push(await cacheCaseRecord(service, prisma, item.url));
  }

  return {
    sourceUrl: index.sourceUrl,
    retrievedAt: index.retrievedAt,
    total: results.length,
    created: results.filter((result) => result.status === "created").length,
    updated: results.filter((result) => result.status === "updated").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    documentsDownloaded: results.reduce((total, result) => total + result.documents.downloaded, 0),
    results,
  };
}
