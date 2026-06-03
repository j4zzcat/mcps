import type { UfoeConfig } from "../config.js";
import { PageFetcher, type FetchedResource, type FetchedResourceMetadata } from "../http/fetchPage.js";
import { parseBestEvidence } from "../parsers/bestEvidence.js";
import { parseCasePage } from "../parsers/casePage.js";
import { parseCasesIndex } from "../parsers/casesIndex.js";
import { parseMethodologyPages } from "../parsers/methodology.js";
import type { CaseRecord, CaseSummary } from "../types/case.js";
import { UfoeToolError } from "../types/errors.js";
import type { MethodologySection } from "../types/methodology.js";
import { slugFromUrl } from "../parsers/common.js";

export class UfoeService {
  private readonly fetcher: PageFetcher;
  private indexCache?: { results: CaseSummary[]; sourceUrl: string; retrievedAt: string };

  constructor(private readonly config: UfoeConfig) {
    this.fetcher = new PageFetcher(config);
  }

  async getCaseIndex(): Promise<{ results: CaseSummary[]; sourceUrl: string; retrievedAt: string }> {
    if (this.indexCache) return this.indexCache;

    const casePage = await this.fetcher.fetchPage("/cases", this.config.cacheTtlSeconds);
    const bestEvidence = await this.fetcher.fetchPage("/best-evidence", this.config.cacheTtlSeconds).catch(() => undefined);
    const parsed = parseCasesIndex({ html: casePage.html, sourceUrl: casePage.url });

    const results = new Map(parsed.map((item) => [item.url, item]));
    if (bestEvidence) {
      for (const item of parseBestEvidence(bestEvidence.html, bestEvidence.url)) {
        const existing = results.get(item.url);
        results.set(item.url, {
          ...existing,
          ...item,
          date: item.date ?? existing?.date,
          year: item.year ?? existing?.year,
          location: {
            ...existing?.location,
            ...item.location,
          },
          categories: [...new Set([...(existing?.categories ?? []), ...item.categories])],
          tags: [...new Set([...(existing?.tags ?? []), ...item.tags])],
          caseScore: item.caseScore ?? existing?.caseScore,
          witnessQualityScore: item.witnessQualityScore ?? existing?.witnessQualityScore,
          evidenceQualityScore: item.evidenceQualityScore ?? existing?.evidenceQualityScore,
        });
      }
    }

    this.indexCache = {
      results: [...results.values()],
      sourceUrl: casePage.url,
      retrievedAt: casePage.retrievedAt,
    };
    return this.indexCache;
  }

  async findCaseUrl(caseIdOrSlug: string): Promise<string> {
    if (/^https?:\/\//i.test(caseIdOrSlug)) return caseIdOrSlug;
    const index = await this.getCaseIndex().catch(() => undefined);
    const needle = caseIdOrSlug.toLowerCase();
    const match = index?.results.find((item) => {
      return (
        item.caseId.toLowerCase() === needle ||
        slugFromUrl(item.url).toLowerCase() === needle ||
        item.url.toLowerCase().includes(needle) ||
        item.title.toLowerCase().includes(needle)
      );
    });
    if (match) return match.url;

    if (/^[a-z0-9-]+$/i.test(caseIdOrSlug)) return new URL(`/cases/${caseIdOrSlug}`, this.config.baseUrl).toString();
    throw new UfoeToolError("NOT_FOUND", `Could not resolve case '${caseIdOrSlug}'`);
  }

  async getCase(caseIdOrSlug: string, includeRawSections = false): Promise<CaseRecord> {
    const url = await this.findCaseUrl(caseIdOrSlug);
    const page = await this.fetcher.fetchPage(url, this.config.cacheTtlSeconds);
    const record = parseCasePage({
      html: page.html,
      sourceUrl: page.url,
      retrievedAt: page.retrievedAt,
      includeRawSections,
    });

    if (!record.title) throw new UfoeToolError("PARSE_ERROR", "Case page did not contain a title.", page.url);
    return record;
  }

  async getResourceMetadata(urlOrPath: string): Promise<FetchedResourceMetadata> {
    return this.fetcher.fetchResourceMetadata(urlOrPath);
  }

  async getResource(urlOrPath: string): Promise<FetchedResource> {
    return this.fetcher.fetchResource(urlOrPath);
  }

  async getMethodology(section: MethodologySection = "all") {
    const paths = ["/methodology", "/quick-walkthrough-ufoe-case-scoring/", "/lab"];
    const pages = await Promise.all(
      paths.map((path) =>
        this.fetcher
          .fetchPage(path, this.config.methodologyCacheTtlSeconds)
          .then((page) => ({ html: page.html, sourceUrl: page.url, retrievedAt: page.retrievedAt }))
          .catch(() => undefined),
      ),
    );

    const found = pages.filter((page): page is NonNullable<typeof page> => Boolean(page));
    if (!found.length) {
      throw new UfoeToolError("NETWORK_ERROR", "Could not fetch any methodology pages.", new URL("/methodology", this.config.baseUrl).toString());
    }

    return parseMethodologyPages(found, section);
  }
}
