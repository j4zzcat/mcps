import { request } from "undici";
import type { UfoeConfig } from "../config.js";
import { logger } from "../logger.js";
import { UfoeToolError } from "../types/errors.js";
import { MemoryCache, RequestLimiter } from "./cache.js";
import { assertRobotsAllowed } from "./robots.js";

export type FetchedPage = {
  url: string;
  html: string;
  retrievedAt: string;
};

export type FetchedResourceMetadata = {
  url: string;
  retrievedAt: string;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
};

export type FetchedResource = FetchedResourceMetadata & {
  content: Buffer;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function metadataFromHeaders(url: string, headers: Record<string, string | string[] | undefined>): FetchedResourceMetadata {
  const contentLength = firstHeader(headers["content-length"]);
  const parsedContentLength = contentLength ? Number(contentLength) : undefined;

  return {
    url,
    retrievedAt: new Date().toISOString(),
    contentType: firstHeader(headers["content-type"]),
    contentLength: Number.isFinite(parsedContentLength) ? parsedContentLength : undefined,
    etag: firstHeader(headers.etag),
    lastModified: firstHeader(headers["last-modified"]),
  };
}

export class PageFetcher {
  private readonly cache = new MemoryCache<FetchedPage>();
  private readonly robotsCache = new MemoryCache<string>();
  private readonly limiter: RequestLimiter;

  constructor(private readonly config: UfoeConfig) {
    this.limiter = new RequestLimiter(config.maxConcurrentRequests);
  }

  async fetchPage(urlOrPath: string, ttlSeconds = this.config.cacheTtlSeconds): Promise<FetchedPage> {
    const requestedUrl = new URL(urlOrPath, this.config.baseUrl).toString();
    const cached = this.cache.get(requestedUrl);
    if (cached) {
      logger.debug("Page cache hit.", { url: requestedUrl });
      return cached;
    }

    return this.limiter.run(async () => {
      let url = requestedUrl;

      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        const redirectedCached = this.cache.get(url);
        if (redirectedCached) {
          logger.debug("Page cache hit.", { url });
          if (url !== requestedUrl) this.cache.set(requestedUrl, redirectedCached, ttlSeconds);
          return redirectedCached;
        }

        if (this.config.respectRobots) {
          await assertRobotsAllowed((robotsUrl) => this.fetchRobots(robotsUrl), url, this.config.userAgent);
        }

        logger.debug("Fetching page.", { url });
        const response = await request(url, {
          method: "GET",
          headers: {
            "user-agent": this.config.userAgent,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        }).catch((error: unknown) => {
          throw new UfoeToolError("NETWORK_ERROR", `Failed to fetch ${url}`, url, error);
        });

        if (response.statusCode >= 300 && response.statusCode < 400) {
          const rawLocation = response.headers.location;
          const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
          await response.body.text().catch(() => undefined);
          if (!location) throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} without Location while fetching ${url}`, url);
          if (redirectCount === 5) throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);

          const nextUrl = new URL(location, url).toString();
          logger.debug("Following redirect.", { from: url, to: nextUrl, statusCode: response.statusCode });
          url = nextUrl;
          continue;
        }

        if (response.statusCode >= 400) {
          throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} while fetching ${url}`, url);
        }

        const html = await response.body.text();
        const page = { url, html, retrievedAt: new Date().toISOString() };
        this.cache.set(url, page, ttlSeconds);
        if (url !== requestedUrl) this.cache.set(requestedUrl, page, ttlSeconds);
        logger.debug("Fetched page.", { url, statusCode: response.statusCode, bytes: html.length });
        return page;
      }

      throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);
    });
  }

  async fetchResourceMetadata(urlOrPath: string): Promise<FetchedResourceMetadata> {
    const requestedUrl = new URL(urlOrPath, this.config.baseUrl).toString();

    return this.limiter.run(async () => {
      let url = requestedUrl;

      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        if (this.config.respectRobots) {
          await assertRobotsAllowed((robotsUrl) => this.fetchRobots(robotsUrl), url, this.config.userAgent);
        }

        logger.debug("Fetching resource metadata.", { url });
        const response = await request(url, {
          method: "HEAD",
          headers: {
            "user-agent": this.config.userAgent,
            accept: "*/*",
          },
        }).catch((error: unknown) => {
          throw new UfoeToolError("NETWORK_ERROR", `Failed to fetch metadata for ${url}`, url, error);
        });

        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = firstHeader(response.headers.location);
          await response.body.text().catch(() => undefined);
          if (!location) throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} without Location while fetching ${url}`, url);
          if (redirectCount === 5) throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);
          url = new URL(location, url).toString();
          continue;
        }

        if (response.statusCode >= 400) {
          throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} while fetching metadata for ${url}`, url);
        }

        return metadataFromHeaders(url, response.headers);
      }

      throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);
    });
  }

  async fetchResource(urlOrPath: string): Promise<FetchedResource> {
    const requestedUrl = new URL(urlOrPath, this.config.baseUrl).toString();

    return this.limiter.run(async () => {
      let url = requestedUrl;

      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        if (this.config.respectRobots) {
          await assertRobotsAllowed((robotsUrl) => this.fetchRobots(robotsUrl), url, this.config.userAgent);
        }

        logger.debug("Fetching resource.", { url });
        const response = await request(url, {
          method: "GET",
          headers: {
            "user-agent": this.config.userAgent,
            accept: "*/*",
          },
        }).catch((error: unknown) => {
          throw new UfoeToolError("NETWORK_ERROR", `Failed to fetch ${url}`, url, error);
        });

        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = firstHeader(response.headers.location);
          await response.body.text().catch(() => undefined);
          if (!location) throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} without Location while fetching ${url}`, url);
          if (redirectCount === 5) throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);
          url = new URL(location, url).toString();
          continue;
        }

        if (response.statusCode >= 400) {
          throw new UfoeToolError("NETWORK_ERROR", `HTTP ${response.statusCode} while fetching ${url}`, url);
        }

        const content = Buffer.from(await response.body.arrayBuffer());
        return {
          ...metadataFromHeaders(url, response.headers),
          content,
        };
      }

      throw new UfoeToolError("NETWORK_ERROR", `Too many redirects while fetching ${requestedUrl}`, requestedUrl);
    });
  }

  private async fetchRobots(robotsUrl: string): Promise<string> {
    const cached = this.robotsCache.get(robotsUrl);
    if (cached) {
      logger.debug("Robots cache hit.", { url: robotsUrl });
      return cached;
    }

    logger.debug("Fetching robots.txt.", { url: robotsUrl });
    const response = await request(robotsUrl, {
      method: "GET",
      headers: { "user-agent": this.config.userAgent },
    });

    if (response.statusCode >= 400) throw new Error(`robots.txt unavailable: ${response.statusCode}`);
    const text = await response.body.text();
    this.robotsCache.set(robotsUrl, text, 86_400);
    logger.debug("Fetched robots.txt.", { url: robotsUrl, statusCode: response.statusCode, bytes: text.length });
    return text;
  }
}
