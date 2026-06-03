import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCasePage } from "../src/parsers/casePage.js";
import { parseCasesIndex } from "../src/parsers/casesIndex.js";
import { parseMethodologyPages } from "../src/parsers/methodology.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("cases index parser", () => {
  it("extracts case summaries", () => {
    const cases = parseCasesIndex({
      html: fixture("cases.html"),
      sourceUrl: "https://ufoevidence.com/cases",
    });

    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      title: "RB-47 Radar-Visual Case",
      url: "https://ufoevidence.com/cases/rb-47",
      year: 1957,
      caseScore: 91,
    });
    expect(cases[0].categories).toContain("Military Engagements");
  });

  it("extracts live-style case cards and ignores navigation links", () => {
    const cases = parseCasesIndex({
      sourceUrl: "https://ufoevidence.com/cases/",
      html: `
        <nav>
          <a href="/start-here">Start Here</a>
          <a href="/cases">Cases</a>
        </nav>
        <div class="case-list-item">
          <a class="case-list-item-inner" href="https://ufoevidence.com/case/uss-nimitz-encounter/">
            <h2 class="case-list-title">USS Nimitz Encounter</h2>
            <div class="case-list-id">UFOe-C014</div>
            <div class="case-list-score">
              <div class="case-list-score-text">Case Score (<span>5.0</span>)</div>
            </div>
            <div class="case-list-pills">
              <div class="case-list-pill">USA</div>
              <div class="case-list-pill">California</div>
              <div class="case-list-pill">San Diego</div>
            </div>
            <div class="case-list-date">
              <div class="case-list-date-year">2004</div>
              <div class="case-list-date-month">November 14</div>
            </div>
          </a>
          <div class="case-list-categories">
            <a href="/cases?category=key-case">Key Case</a>
            <a href="/cases?category=military-engagements">Military Engagements</a>
          </div>
          <div class="case-list-tags">
            <a href="/case-tag/radar-data/">Radar Data</a>
            <a href="/case-tag/pilot/">Pilot</a>
          </div>
        </div>
        <div class="case-sc-item">
          <a class="case-sc-item-inner" href="https://ufoevidence.com/case/uss-nimitz-encounter/">
            <div class="case-sc-title">USS Nimitz Encounter</div>
            <div class="case-sc-score-text">Case Score (<span>5.0</span>)</div>
          </a>
        </div>
        <div class="case-sc-item">
          <a class="case-sc-item-inner" href="https://ufoevidence.com/case/brazil-colares-mass-encounter-sighting/">
            <div class="case-sc-title">Brazil Colares Mass Sighting &amp; Encounter</div>
            <div class="case-sc-score-text">Case Score (<span>4.6</span>)</div>
            <div class="case-sc-pill">Brazil</div>
            <div class="case-sc-pill">Pará</div>
            <div class="case-sc-pill">Colares</div>
            <div class="case-sc-date-year">1977</div>
            <div class="case-sc-date-month">October 20</div>
          </a>
        </div>
      `,
    });

    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      title: "USS Nimitz Encounter",
      url: "https://ufoevidence.com/case/uss-nimitz-encounter/",
      year: 2004,
      date: "November 14 2004",
      caseScore: 5,
      location: {
        country: "USA",
        state: "California",
        city: "San Diego",
      },
    });
    expect(cases[0].categories).toEqual(["Key Case", "Military Engagements"]);
    expect(cases[0].tags).toEqual(["Radar Data", "Pilot"]);
    expect(cases[1]).toMatchObject({
      title: "Brazil Colares Mass Sighting & Encounter",
      caseScore: 4.6,
      year: 1977,
    });
  });
});

describe("case page parser", () => {
  it("extracts scores, effects, sources, and documents", () => {
    const record = parseCasePage({
      html: fixture("case-rb47.html"),
      sourceUrl: "https://ufoevidence.com/cases/rb-47",
      retrievedAt: "2026-06-03T00:00:00.000Z",
      includeRawSections: true,
    });

    expect(record.title).toBe("RB-47 Radar-Visual Case");
    expect(record.scores?.caseScore).toBe(91);
    expect(record.effects?.[0]?.subEffects[0]?.eqs?.dataSensors).toBe(95);
    expect(record.sources?.some((source) => source.title?.includes("Condon Report"))).toBe(true);
    expect(record.documents?.some((doc) => doc.type === "spreadsheet")).toBe(true);
    expect(record.rawSections?.Summary).toContain("luminous object");
  });
});

describe("methodology parser", () => {
  it("returns methodology weights", () => {
    const methodology = parseMethodologyPages(
      [
        {
          html: fixture("methodology.html"),
          sourceUrl: "https://ufoevidence.com/methodology",
          retrievedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
      "weights",
    );

    expect(methodology.weights?.eqs.dataSensors).toBe(45);
    expect(methodology.weights?.final.evidenceQualityScore).toBe(65);
    expect(methodology.content).toContain("Instrumental");
  });
});
