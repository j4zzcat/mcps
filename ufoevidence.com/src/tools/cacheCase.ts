import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CaseRecord, Investigation } from "../types/case.js";
import type { SubEffectAnalysis } from "../types/scoring.js";
import type { CaseDocument, SourceRecord } from "../types/source.js";
import { logger } from "../logger.js";
import type { UfoeService } from "./service.js";
import type { FetchedResourceMetadata } from "../http/fetchPage.js";

export const cacheCaseInput = {
  caseIdOrSlug: z.string().min(1),
};

type CacheStatus = "created" | "updated" | "unchanged";

type CacheDocumentResult = {
  url: string;
  title: string;
  type?: string;
  status: CacheStatus;
  revision?: string;
  contentHash?: string;
  downloaded: boolean;
};

type CacheCaseResult = {
  caseId: string;
  title: string;
  url: string;
  status: CacheStatus;
  caseChanged: boolean;
  documents: {
    total: number;
    spreadsheets: number;
    downloaded: number;
    updated: number;
    unchanged: number;
    deleted: number;
    results: CacheDocumentResult[];
  };
  sourceRetrievedAt: string;
  lastCheckedAt: string;
};

type ExistingCase = Awaited<ReturnType<PrismaClient["cachedCase"]["findFirst"]>>;

type ExistingDocument = Awaited<ReturnType<PrismaClient["caseDocument"]["findUnique"]>>;

function normalizeForJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map((item) => normalizeForJson(item) ?? null);

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, normalizeForJson(item)] as const)
      .filter(([, item]) => item !== undefined),
  );
}

function stableValue(value: unknown): unknown {
  const normalized = normalizeForJson(value);
  if (normalized === null || typeof normalized !== "object") return normalized;
  if (Array.isArray(normalized)) return normalized.map(stableValue);

  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPrismaBytes(value: Buffer): Uint8Array<ArrayBuffer> {
  const arrayBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}

function json(value: unknown): Prisma.InputJsonValue {
  return stableValue(value) as Prisma.InputJsonValue;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function revisionFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    for (const key of ["revision", "rev", "ver", "version", "v", "updated"]) {
      const value = parsed.searchParams.get(key);
      if (value) return `${key}:${value}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function inferRevision(url: string, metadata?: FetchedResourceMetadata): string | undefined {
  return revisionFromUrl(url) ?? revisionFromUrl(metadata?.url ?? "") ?? metadata?.etag ?? metadata?.lastModified;
}

function metadataSignatureChanged(existing: ExistingDocument, metadata?: FetchedResourceMetadata, revision?: string): boolean {
  if (!existing) return true;
  if (revision && existing.revision !== revision) return true;
  if (metadata?.etag && existing.etag !== metadata.etag) return true;
  if (metadata?.lastModified && existing.lastModified !== metadata.lastModified) return true;
  if (metadata?.contentLength && existing.contentLength !== metadata.contentLength) return true;
  return false;
}

function caseHashInput(caseRecord: CaseRecord): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...caseRecord };
  delete rest.retrievedAt;
  return rest;
}

function caseDocumentSetHash(documents: CaseDocument[]): string {
  return sha256(stableStringify(documents.map((doc) => ({ title: doc.title, url: doc.url, type: doc.type, description: doc.description }))));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeDocuments(documents: CaseDocument[]): CaseDocument[] {
  const byUrl = new Map<string, CaseDocument>();

  for (const doc of documents) {
    const existing = byUrl.get(doc.url);
    if (!existing) {
      byUrl.set(doc.url, doc);
      continue;
    }

    const existingTitleLooksLikeUrl = existing.title === existing.url || existing.title.startsWith("http");
    const nextTitleLooksUseful = doc.title !== doc.url && !doc.title.startsWith("http");
    if (existingTitleLooksLikeUrl && nextTitleLooksUseful) {
      byUrl.set(doc.url, { ...existing, ...doc });
    }
  }

  return [...byUrl.values()];
}

async function getCaseWithIndexMetadata(service: UfoeService, caseIdOrSlug: string): Promise<CaseRecord> {
  const caseRecord = await service.getCase(caseIdOrSlug, true);
  const index = await service.getCaseIndex().catch(() => undefined);
  const summary = index?.results.find((item) => item.url === caseRecord.url || item.caseId === caseRecord.caseId);
  if (!summary) return caseRecord;

  return {
    ...caseRecord,
    date: caseRecord.date ?? summary.date,
    year: caseRecord.year ?? summary.year,
    location: {
      ...summary.location,
      ...caseRecord.location,
    },
    categories: uniqueStrings([...summary.categories, ...caseRecord.categories]),
    tags: uniqueStrings([...summary.tags, ...caseRecord.tags]),
    caseScore: caseRecord.caseScore ?? summary.caseScore,
    witnessQualityScore: caseRecord.witnessQualityScore ?? summary.witnessQualityScore,
    evidenceQualityScore: caseRecord.evidenceQualityScore ?? summary.evidenceQualityScore,
  };
}

function spreadsheetRevisionSummary(documents: Array<{ url: string; revision?: string; contentHash?: string }>): string | undefined {
  const values = documents
    .filter((doc) => doc.revision || doc.contentHash)
    .map((doc) => `${doc.url}:${doc.revision ?? doc.contentHash}`)
    .sort();
  return values.length ? sha256(values.join("\n")) : undefined;
}

async function maybeFetchMetadata(service: UfoeService, doc: CaseDocument): Promise<FetchedResourceMetadata | undefined> {
  try {
    return await service.getResourceMetadata(doc.url);
  } catch (error) {
    logger.warning("Failed to fetch document metadata; falling back to content fetch if needed.", { url: doc.url, error });
    return undefined;
  }
}

async function upsertDocument(
  prisma: PrismaClient,
  service: UfoeService,
  caseId: string,
  doc: CaseDocument,
): Promise<CacheDocumentResult> {
  const existing = await prisma.caseDocument.findUnique({
    where: {
      caseId_url: {
        caseId,
        url: doc.url,
      },
    },
  });
  const metadata = await maybeFetchMetadata(service, doc);
  let revision = inferRevision(doc.url, metadata);
  const isSpreadsheet = doc.type === "spreadsheet";
  const hasKnownSignature = Boolean(revision || metadata?.etag || metadata?.lastModified);
  const shouldDownload =
    isSpreadsheet && (!existing?.contentHash || !existing.content || !hasKnownSignature || metadataSignatureChanged(existing, metadata, revision));
  const downloaded = shouldDownload ? await service.getResource(doc.url) : undefined;
  const contentHash = downloaded ? sha256(downloaded.content) : (existing?.contentHash ?? undefined);

  if (downloaded) {
    revision = inferRevision(doc.url, downloaded) ?? revision;
  }

  const nextData = compact({
    title: doc.title,
    url: doc.url,
    finalUrl: downloaded?.url ?? metadata?.url,
    type: doc.type,
    description: doc.description,
    revision,
    etag: downloaded?.etag ?? metadata?.etag,
    lastModified: downloaded?.lastModified ?? metadata?.lastModified,
    contentType: downloaded?.contentType ?? metadata?.contentType,
    contentLength: downloaded?.contentLength ?? metadata?.contentLength,
    contentHash,
    content: downloaded ? toPrismaBytes(downloaded.content) : undefined,
    retrievedAt: metadata || downloaded ? new Date(downloaded?.retrievedAt ?? metadata?.retrievedAt ?? new Date().toISOString()) : undefined,
    downloadedAt: downloaded ? new Date(downloaded.retrievedAt) : undefined,
  });
  const status: CacheStatus =
    !existing
      ? "created"
      : downloaded || metadataSignatureChanged(existing, metadata, revision) || existing.title !== doc.title || (existing.type ?? undefined) !== doc.type
        ? "updated"
        : "unchanged";

  if (existing) {
    if (status === "updated") {
      await prisma.caseDocument.update({
        where: { id: existing.id },
        data: nextData,
      });
    }
  } else {
    await prisma.caseDocument.create({
      data: compact({
        caseId,
        ...nextData,
      }),
    });
  }

  return {
    url: doc.url,
    title: doc.title,
    type: doc.type,
    status,
    revision,
    contentHash,
    downloaded: Boolean(downloaded),
  };
}

async function replaceCaseChildren(prisma: PrismaClient, caseRecord: CaseRecord): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.caseCategory.deleteMany({ where: { caseId: caseRecord.caseId } });
    await tx.caseTag.deleteMany({ where: { caseId: caseRecord.caseId } });
    await tx.caseSource.deleteMany({ where: { caseId: caseRecord.caseId } });
    await tx.caseInvestigation.deleteMany({ where: { caseId: caseRecord.caseId } });
    await tx.caseEffect.deleteMany({ where: { caseId: caseRecord.caseId } });

    if (caseRecord.categories.length) {
      await tx.caseCategory.createMany({
        data: caseRecord.categories.map((name) => ({ caseId: caseRecord.caseId, name })),
      });
    }

    if (caseRecord.tags.length) {
      await tx.caseTag.createMany({
        data: caseRecord.tags.map((name) => ({ caseId: caseRecord.caseId, name })),
      });
    }

    if (caseRecord.sources?.length) {
      await tx.caseSource.createMany({
        data: caseRecord.sources.map((source: SourceRecord) =>
          compact({
            caseId: caseRecord.caseId,
            sourceId: source.sourceId,
            title: source.title,
            organization: source.organization,
            author: source.author,
            year: source.year === undefined ? undefined : String(source.year),
            type: source.type,
            scope: source.scope,
            findings: source.findings,
            url: source.url,
            rawText: source.rawText,
          }),
        ),
      });
    }

    if (caseRecord.investigations?.length) {
      await tx.caseInvestigation.createMany({
        data: caseRecord.investigations.map((investigation: Investigation) =>
          compact({
            caseId: caseRecord.caseId,
            title: investigation.title,
            organization: investigation.organization,
            findings: investigation.findings,
            url: investigation.url,
            rawText: investigation.rawText,
          }),
        ),
      });
    }

    for (const effect of caseRecord.effects ?? []) {
      const savedEffect = await tx.caseEffect.create({
        data: compact({
          caseId: caseRecord.caseId,
          effectId: effect.effectId,
          effectName: effect.effectName,
          effectCategory: effect.effectCategory,
          present: effect.present,
          score: effect.score,
          rawJson: json(effect),
        }),
      });

      if (effect.subEffects.length) {
        await tx.caseSubEffect.createMany({
          data: effect.subEffects.map((subEffect: SubEffectAnalysis) =>
            compact({
              effectRowId: savedEffect.id,
              subEffectId: subEffect.subEffectId,
              name: subEffect.name,
              findings: subEffect.findings,
              witnessQuantity: subEffect.wqs?.witnessQuantity,
              eventConditions: subEffect.wqs?.eventConditions,
              credibilityReliability: subEffect.wqs?.credibilityReliability,
              witnessRationale: subEffect.wqs?.rationale,
              dataSensors: subEffect.eqs?.dataSensors,
              visualRecords: subEffect.eqs?.visualRecords,
              publishedReports: subEffect.eqs?.publishedReports,
              evidenceRationale: subEffect.eqs?.rationale,
              probativeFactor: subEffect.probativeFactor,
              sourcesJson: subEffect.sources ? json(subEffect.sources) : undefined,
              caveatsJson: subEffect.caveats ? json(subEffect.caveats) : undefined,
              rawJson: json(subEffect),
            }),
          ),
        });
      }
    }
  });
}

async function upsertCaseRow(
  prisma: PrismaClient,
  caseRecord: CaseRecord,
  existing: ExistingCase,
  parsedHash: string,
  documentSetHash: string,
  spreadsheetRevision?: string,
): Promise<CacheStatus> {
  const now = new Date();
  const data = compact({
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    url: caseRecord.url,
    subtitle: caseRecord.subtitle,
    summary: caseRecord.summary,
    keyQuote: caseRecord.keyQuote,
    date: caseRecord.date,
    year: caseRecord.year,
    country: caseRecord.location?.country,
    state: caseRecord.location?.state,
    city: caseRecord.location?.city,
    latitude: caseRecord.location?.lat,
    longitude: caseRecord.location?.lng,
    status: caseRecord.status,
    witnessType: caseRecord.witnessType,
    witnessCount: caseRecord.witnessCount === undefined ? undefined : String(caseRecord.witnessCount),
    caseScore: caseRecord.scores?.caseScore ?? caseRecord.caseScore,
    witnessQualityScore: caseRecord.scores?.witnessQualityScore ?? caseRecord.witnessQualityScore,
    evidenceQualityScore: caseRecord.scores?.evidenceQualityScore ?? caseRecord.evidenceQualityScore,
    pageHash: parsedHash,
    parsedHash,
    documentSetHash,
    spreadsheetRevision,
    rawJson: json(caseRecord),
    scoresJson: caseRecord.scores ? json(caseRecord.scores) : undefined,
    effectsJson: caseRecord.effects ? json(caseRecord.effects) : undefined,
    rawSectionsJson: caseRecord.rawSections ? json(caseRecord.rawSections) : undefined,
    sourceRetrievedAt: new Date(caseRecord.retrievedAt),
    lastCheckedAt: now,
  });

  if (!existing) {
    await prisma.cachedCase.create({ data });
    return "created";
  }

  if (existing.parsedHash === parsedHash && existing.documentSetHash === documentSetHash && existing.spreadsheetRevision === spreadsheetRevision) {
    await prisma.cachedCase.update({
      where: { id: existing.id },
      data: {
        sourceRetrievedAt: new Date(caseRecord.retrievedAt),
        lastCheckedAt: now,
      },
    });
    return "unchanged";
  }

  await prisma.cachedCase.update({
    where: { id: existing.id },
    data,
  });
  return "updated";
}

export async function cacheCaseRecord(service: UfoeService, prisma: PrismaClient, caseIdOrSlug: string): Promise<CacheCaseResult> {
  const fetchedCaseRecord = await getCaseWithIndexMetadata(service, caseIdOrSlug);
  const documents = dedupeDocuments(fetchedCaseRecord.documents ?? []);
  const caseRecord: CaseRecord = { ...fetchedCaseRecord, documents };
  const parsedHash = sha256(stableStringify(caseHashInput(caseRecord)));
  const documentSetHash = caseDocumentSetHash(documents);
  const existing = await prisma.cachedCase.findFirst({
    where: {
      OR: [{ caseId: caseRecord.caseId }, { url: caseRecord.url }],
    },
  });

  let caseStatus = await upsertCaseRow(prisma, caseRecord, existing, parsedHash, documentSetHash, existing?.spreadsheetRevision ?? undefined);

  if (caseStatus !== "unchanged") {
    await replaceCaseChildren(prisma, caseRecord);
  }

  const documentResults: CacheDocumentResult[] = [];
  let deletedDocuments = 0;
  const previousDocuments = await prisma.caseDocument.findMany({ where: { caseId: caseRecord.caseId } });
  const currentDocumentUrls = new Set(documents.map((doc) => doc.url));

  for (const existingDocument of previousDocuments) {
    if (!currentDocumentUrls.has(existingDocument.url)) {
      await prisma.caseDocument.delete({ where: { id: existingDocument.id } });
      deletedDocuments += 1;
    }
  }

  for (const doc of documents) {
    documentResults.push(await upsertDocument(prisma, service, caseRecord.caseId, doc));
  }

  const spreadsheetRevision = spreadsheetRevisionSummary(
    documentResults.filter((doc) => doc.type === "spreadsheet").map((doc) => ({ url: doc.url, revision: doc.revision, contentHash: doc.contentHash })),
  );

  if (spreadsheetRevision !== (existing?.spreadsheetRevision ?? undefined)) {
    await prisma.cachedCase.update({
      where: { caseId: caseRecord.caseId },
      data: {
        spreadsheetRevision: spreadsheetRevision ?? null,
        lastCheckedAt: new Date(),
      },
    });
    if (caseStatus === "unchanged") caseStatus = "updated";
  }

  const downloaded = documentResults.filter((doc) => doc.downloaded).length;
  const updated = documentResults.filter((doc) => doc.status === "updated").length;
  const unchanged = documentResults.filter((doc) => doc.status === "unchanged").length;

  return {
    caseId: caseRecord.caseId,
    title: caseRecord.title,
    url: caseRecord.url,
    status: caseStatus,
    caseChanged: caseStatus !== "unchanged",
    documents: {
      total: documents.length,
      spreadsheets: documentResults.filter((doc) => doc.type === "spreadsheet").length,
      downloaded,
      updated,
      unchanged,
      deleted: deletedDocuments,
      results: documentResults,
    },
    sourceRetrievedAt: caseRecord.retrievedAt,
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function cacheCase(
  service: UfoeService,
  prisma: PrismaClient,
  input: z.infer<z.ZodObject<typeof cacheCaseInput>>,
): Promise<CacheCaseResult> {
  return cacheCaseRecord(service, prisma, input.caseIdOrSlug);
}
