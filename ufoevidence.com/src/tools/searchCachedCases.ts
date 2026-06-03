import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { lexicalScore } from "./common.js";

const sortableFields = [
  "relevance",
  "caseScore",
  "witnessQualityScore",
  "evidenceQualityScore",
  "year",
  "title",
  "sourceRetrievedAt",
  "lastCheckedAt",
  "updatedAt",
] as const;

export const searchCachedCasesInput = {
  query: z.string().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  decade: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minCaseScore: z.number().optional(),
  maxCaseScore: z.number().optional(),
  sortBy: z.enum(sortableFields).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
};

const cachedCaseSearchSelect = {
  caseId: true,
  title: true,
  url: true,
  subtitle: true,
  summary: true,
  keyQuote: true,
  date: true,
  year: true,
  country: true,
  state: true,
  city: true,
  latitude: true,
  longitude: true,
  status: true,
  witnessType: true,
  witnessCount: true,
  caseScore: true,
  witnessQualityScore: true,
  evidenceQualityScore: true,
  sourceRetrievedAt: true,
  lastCheckedAt: true,
  updatedAt: true,
  categories: { select: { name: true } },
  tags: { select: { name: true } },
} satisfies Prisma.CachedCaseSelect;

type CachedCaseRow = Prisma.CachedCaseGetPayload<{ select: typeof cachedCaseSearchSelect }>;

type CachedCaseWithRelevance = CachedCaseRow & {
  relevance?: number;
};

function includesText(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}

function searchableText(row: CachedCaseRow): string {
  return [
    row.caseId,
    row.title,
    row.subtitle,
    row.summary,
    row.keyQuote,
    row.country,
    row.state,
    row.city,
    row.status,
    row.witnessType,
    ...row.categories.map((category) => category.name),
    ...row.tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreQuery(row: CachedCaseRow, query: string): number {
  return lexicalScore(searchableText(row), query);
}

function parseDecade(input: string): number | undefined {
  const parsed = Number(input.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compareDefined(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function compareSortValues(a: unknown, b: unknown, sortOrder: "asc" | "desc"): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;

  if (aMissing) return bMissing ? 0 : 1;
  if (bMissing) return -1;

  const comparison = compareDefined(a, b);
  return sortOrder === "asc" ? comparison : -comparison;
}

function sortValue(row: CachedCaseWithRelevance, sortBy: (typeof sortableFields)[number]): unknown {
  switch (sortBy) {
    case "relevance":
      return row.relevance;
    case "caseScore":
      return row.caseScore;
    case "witnessQualityScore":
      return row.witnessQualityScore;
    case "evidenceQualityScore":
      return row.evidenceQualityScore;
    case "year":
      return row.year;
    case "title":
      return row.title;
    case "sourceRetrievedAt":
      return row.sourceRetrievedAt;
    case "lastCheckedAt":
      return row.lastCheckedAt;
    case "updatedAt":
      return row.updatedAt;
  }
}

function formatDate(value: Date): string {
  return value.toISOString();
}

function toResult(row: CachedCaseWithRelevance) {
  return {
    caseId: row.caseId,
    title: row.title,
    url: row.url,
    year: row.year ?? undefined,
    location:
      row.country || row.state || row.city || row.latitude !== null || row.longitude !== null
        ? {
            country: row.country ?? undefined,
            state: row.state ?? undefined,
            city: row.city ?? undefined,
            lat: row.latitude ?? undefined,
            lng: row.longitude ?? undefined,
          }
        : undefined,
    categories: row.categories.map((category) => category.name),
    tags: row.tags.map((tag) => tag.name),
    status: row.status ?? undefined,
    caseScore: row.caseScore ?? undefined,
    witnessQualityScore: row.witnessQualityScore ?? undefined,
    evidenceQualityScore: row.evidenceQualityScore ?? undefined,
    relevance: row.relevance,
    sourceRetrievedAt: formatDate(row.sourceRetrievedAt),
    lastCheckedAt: formatDate(row.lastCheckedAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

export async function searchCachedCases(prisma: PrismaClient, input: z.infer<z.ZodObject<typeof searchCachedCasesInput>>) {
  const rows: CachedCaseRow[] = await prisma.cachedCase.findMany({
    select: cachedCaseSearchSelect,
  });

  let results: CachedCaseWithRelevance[] = rows;

  if (input.query) {
    results = results
      .map((row) => ({ ...row, relevance: scoreQuery(row, input.query ?? "") }))
      .filter((row) => (row.relevance ?? 0) > 0);
  }

  if (input.category) {
    const category = input.category.toLowerCase();
    results = results.filter((row) => row.categories.some((value) => includesText(value.name, category)));
  }

  if (input.country) {
    const country = input.country.toLowerCase();
    results = results.filter((row) => includesText(row.country, country));
  }

  if (input.decade) {
    const decadeStart = parseDecade(input.decade);
    if (decadeStart !== undefined) {
      results = results.filter((row) => row.year !== null && row.year >= decadeStart && row.year < decadeStart + 10);
    }
  }

  if (input.tags?.length) {
    const tags = input.tags.map((tag) => tag.toLowerCase());
    results = results.filter((row) => tags.every((tag) => row.tags.some((value) => includesText(value.name, tag))));
  }

  if (input.minCaseScore !== undefined) results = results.filter((row) => (row.caseScore ?? -Infinity) >= input.minCaseScore!);
  if (input.maxCaseScore !== undefined) results = results.filter((row) => (row.caseScore ?? Infinity) <= input.maxCaseScore!);

  const sortBy = input.sortBy ?? (input.query ? "relevance" : "caseScore");
  const sortOrder = input.sortOrder ?? "desc";
  results = [...results].sort((a, b) => {
    return compareSortValues(sortValue(a, sortBy), sortValue(b, sortBy), sortOrder);
  });

  const paged = results.slice(input.offset, input.offset + input.limit);
  return {
    results: paged.map(toResult),
    count: results.length,
    totalCached: rows.length,
    sortBy,
    sortOrder,
    limit: input.limit,
    offset: input.offset,
    source: "local_sqlite_cache",
  };
}
