import { describe, expect, it } from "vitest";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { PageFetcher } from "../src/http/fetchPage.js";
import type { UfoeConfig } from "../src/config.js";

describe("PageFetcher", () => {
  it("follows redirects and reports the final URL", async () => {
    const originalDispatcher = getGlobalDispatcher();
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent.get("https://ufo.test").intercept({ method: "GET", path: "/cases" }).reply(301, "", {
      headers: { location: "/cases/" },
    });
    mockAgent.get("https://ufo.test").intercept({ method: "GET", path: "/cases/" }).reply(200, "<main>Case Score (5.0)</main>", {
      headers: { "content-type": "text/html" },
    });
    setGlobalDispatcher(mockAgent);

    try {
      const config: UfoeConfig = {
        baseUrl: "https://ufo.test",
        userAgent: "ufoe-test",
        cacheTtlSeconds: 60,
        methodologyCacheTtlSeconds: 60,
        maxConcurrentRequests: 1,
        respectRobots: false,
        logLevel: "emergency",
      };

      const page = await new PageFetcher(config).fetchPage("/cases");

      expect(page.url).toBe("https://ufo.test/cases/");
      expect(page.html).toContain("Case Score (5.0)");
    } finally {
      setGlobalDispatcher(originalDispatcher);
      await mockAgent.close();
    }
  });
});
