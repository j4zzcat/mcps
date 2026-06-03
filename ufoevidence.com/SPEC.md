# UFOevidence.com MCP Server Implementation Plan

## Goal

Build a read-only MCP server for UFOevidence.com that allows an LLM client to search cases, retrieve structured case data, inspect scores, explain scoring methodology, access effect/sub-effect analysis, trace claims to sources, and optionally simulate Case Lab weighting changes.

The first version should prioritize faithful extraction and provenance over broad functionality.

## 1. Scope

### In scope

* Search and browse UFOevidence.com cases.
* Retrieve full case records.
* Retrieve top-line case scores:

    * Case Score
    * Witness Quality Score, WQS
    * Evidence Quality Score, EQS
* Retrieve effect-level and sub-effect-level scoring data.
* Retrieve methodology and scoring definitions.
* Retrieve source lists and investigation/corroboration sections.
* Return links to case scoring spreadsheets or scoring documents when available.
* Simulate Case Lab score weighting locally where enough structured inputs are available.
* Preserve all source URLs and page provenance.

### Out of scope for v1

* Editing or contributing cases.
* User accounts or authenticated site access.
* Crawling behind paywalls or non-public files.
* Claiming that UFOe scores prove anomalous origin.
* Scraping at high rate.
* Full OCR of PDFs or spreadsheet contents unless directly linked and downloadable.
* Browser automation unless static HTML parsing is insufficient.

## 2. Key site observations to encode

UFOevidence.com exposes:

* A public case archive.
* Case categories such as:

    * Sightings
    * Military Engagements
    * Nuclear Incursions
    * Aerial Altercations
    * Encounters
* A “Best Evidence” page ranking cases by case score.
* A Case Lab page with adjustable weights.
* A scoring methodology based on:

    * WQS: Witness Quality Score
    * EQS: Evidence Quality Score
    * Case Score
    * Effect categories
    * Sub-effects
    * Probative Factor
* Case pages containing:

    * Case metadata
    * Summary / investigations
    * Scores
    * Effects present
    * Sub-effect analysis
    * Sources
    * Links to supporting documents / spreadsheets when available

Important methodology defaults visible on the site:

```text
EQS component defaults:
- Instrumental / Sensing Data: 45%
- Visual Records: 30%
- Reports / Investigations: 25%

WQS component defaults:
- Witness Quantity: 33.333%
- Event Conditions: 33.333%
- Credibility / Reliability: 33.333%

Final Case Score defaults:
- Evidence Quality Score: 65%
- Witness Quality Score: 35%
```

Note: verify formula details during implementation, because one walkthrough page appears to contain a likely typo stating `65% EQS + 45% WQS`; the Case Lab UI shows 65% / 35%.

## 3. Architecture

### Recommended stack

* Language: TypeScript
* Runtime: Node.js 20+
* MCP SDK: official Model Context Protocol TypeScript SDK
* HTTP client: `undici` or `fetch`
* HTML parsing: `cheerio`
* Schema validation: `zod`
* Optional table parsing: `xlsx`
* Tests: `vitest`
* Lint/format: `eslint` + `prettier`

### Project layout

```text
ufoe-mcp/
  package.json
  tsconfig.json
  README.md
  .env.example
  src/
    index.ts
    server.ts
    config.ts
    http/
      fetchPage.ts
      cache.ts
      robots.ts
    parsers/
      casesIndex.ts
      casePage.ts
      methodology.ts
      bestEvidence.ts
      lab.ts
      common.ts
    scoring/
      formulas.ts
      simulate.ts
    tools/
      searchCases.ts
      getCase.ts
      getCaseScore.ts
      getCaseEffects.ts
      getSubEffectAnalysis.ts
      getMethodology.ts
      getCaseSources.ts
      traceCaseClaim.ts
      getCaseSpreadsheet.ts
      simulateCaseLabWeights.ts
    types/
      case.ts
      scoring.ts
      source.ts
      methodology.ts
    test/
      fixtures/
      parsers/
      tools/
```

## 4. Data model

### CaseSummary

```ts
type CaseSummary = {
  caseId: string;
  title: string;
  url: string;
  date?: string;
  year?: number;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    lat?: number;
    lng?: number;
  };
  categories: string[];
  tags: string[];
  status?: string;
  caseScore?: number;
  witnessQualityScore?: number;
  evidenceQualityScore?: number;
};
```

### CaseRecord

```ts
type CaseRecord = CaseSummary & {
  subtitle?: string;
  summary?: string;
  keyQuote?: string;
  witnessType?: string;
  witnessCount?: string | number;
  investigations?: Investigation[];
  scores?: CaseScores;
  effects?: EffectAnalysis[];
  sources?: SourceRecord[];
  documents?: CaseDocument[];
  media?: MediaItem[];
  rawSections?: Record<string, string>;
  retrievedAt: string;
};
```

### CaseScores

```ts
type CaseScores = {
  caseScore?: number;
  witnessQualityScore?: number;
  evidenceQualityScore?: number;
  effectScores?: Record<string, {
    caseScore?: number;
    witnessQualityScore?: number;
    evidenceQualityScore?: number;
  }>;
  scoringNotes?: string[];
};
```

### EffectAnalysis

```ts
type EffectAnalysis = {
  effectId?: string;
  effectName: string;
  effectCategory?: string;
  present?: boolean;
  score?: number;
  subEffects: SubEffectAnalysis[];
};
```

### SubEffectAnalysis

```ts
type SubEffectAnalysis = {
  subEffectId?: string;
  name: string;
  findings?: string;
  wqs?: {
    witnessQuantity?: number;
    eventConditions?: number;
    credibilityReliability?: number;
    rationale?: string;
  };
  eqs?: {
    dataSensors?: number;
    visualRecords?: number;
    publishedReports?: number;
    rationale?: string;
  };
  probativeFactor?: number;
  sources?: string[];
  caveats?: string[];
};
```

### SourceRecord

```ts
type SourceRecord = {
  sourceId?: string;
  title?: string;
  organization?: string;
  author?: string;
  year?: string | number;
  type?: string;
  scope?: string;
  findings?: string;
  url?: string;
  rawText?: string;
};
```

### CaseDocument

```ts
type CaseDocument = {
  title: string;
  type?: "spreadsheet" | "pdf" | "doc" | "web" | "unknown";
  url: string;
  description?: string;
};
```

## 5. MCP tools

### 5.1 `search_cases`

Search case archive by query and optional filters.

Input:

```ts
{
  query?: string;
  category?: string;
  country?: string;
  decade?: string;
  tags?: string[];
  minCaseScore?: number;
  maxCaseScore?: number;
  limit?: number;
  offset?: number;
}
```

Output:

```ts
{
  results: CaseSummary[];
  count: number;
  sourceUrl: string;
}
```

Implementation notes:

* First parse `/cases`.
* If site has query params or API endpoints, use them.
* If not, fetch case index and filter locally.
* Cache case index for configurable TTL.

### 5.2 `get_case`

Retrieve full case record by case ID or URL slug.

Input:

```ts
{
  caseIdOrSlug: string;
  includeRawSections?: boolean;
}
```

Output:

```ts
{
  case: CaseRecord;
  sourceUrl: string;
}
```

Implementation notes:

* Support `UFOe-C014`, full URL, or slug.
* Parse metadata, title, scores, effects, investigation sections, sources, document links.
* Return `rawSections` only when requested.

### 5.3 `get_case_score`

Return scores only.

Input:

```ts
{
  caseIdOrSlug: string;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  scores: CaseScores;
  sourceUrl: string;
}
```

### 5.4 `get_case_effects`

Return effect-level and sub-effect-level data.

Input:

```ts
{
  caseIdOrSlug: string;
  effectCategory?: string;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  effects: EffectAnalysis[];
  sourceUrl: string;
}
```

### 5.5 `get_sub_effect_analysis`

Return one sub-effect if ID/name is provided, otherwise all sub-effects.

Input:

```ts
{
  caseIdOrSlug: string;
  subEffect?: string;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  subEffects: SubEffectAnalysis[];
  sourceUrl: string;
}
```

### 5.6 `get_methodology`

Return methodology sections.

Input:

```ts
{
  section?: "overview" | "scores" | "effects" | "probative_factor" | "weights" | "case_lab" | "all";
}
```

Output:

```ts
{
  section: string;
  content: string;
  weights?: {
    eqs: Record<string, number>;
    wqs: Record<string, number>;
    final: Record<string, number>;
  };
  sourceUrls: string[];
}
```

Implementation notes:

* Parse methodology page and quick-walkthrough page.
* Include caveat that scores indicate evidence quantity/quality, not proof of anomalous origin.

### 5.7 `get_case_sources`

Return sources and investigation records for a case.

Input:

```ts
{
  caseIdOrSlug: string;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  sources: SourceRecord[];
  documents: CaseDocument[];
  sourceUrl: string;
}
```

### 5.8 `trace_case_claim`

Find source support for a claim within a case.

Input:

```ts
{
  caseIdOrSlug: string;
  claim: string;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  matchedSections: Array<{
    sectionTitle?: string;
    text: string;
    sourceRefs?: string[];
    relatedSubEffects?: string[];
  }>;
  sources: SourceRecord[];
  caveat: string;
  sourceUrl: string;
}
```

Implementation notes:

* Use local text search over parsed case sections.
* Do not use LLM inference in the MCP server.
* If no exact match, return closest sections by simple lexical scoring.
* Include caveat: “This traces site text to listed sources; it does not independently verify the claim.”

### 5.9 `get_case_spreadsheet`

Return spreadsheet/scoring document links.

Input:

```ts
{
  caseIdOrSlug: string;
  download?: boolean;
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  spreadsheets: CaseDocument[];
  sourceUrl: string;
}
```

Implementation notes:

* If `download=false`, return links only.
* If `download=true`, download public XLSX/CSV if available and return parsed workbook metadata.
* Do not execute macros.
* Do not fetch private Google Drive docs unless public export link is available.

### 5.10 `simulate_case_lab_weights`

Recalculate scores using alternate Case Lab weights.

Input:

```ts
{
  caseIdOrSlug: string;
  weights: {
    eqs?: {
      dataSensors?: number;
      visualRecords?: number;
      reportsInvestigations?: number;
    };
    wqs?: {
      witnessQuantity?: number;
      eventConditions?: number;
      credibilityReliability?: number;
    };
    final?: {
      evidenceQualityScore?: number;
      witnessQualityScore?: number;
    };
  };
}
```

Output:

```ts
{
  caseId: string;
  title: string;
  originalScores: CaseScores;
  simulatedScores: CaseScores;
  assumptions: string[];
  caveats: string[];
  sourceUrls: string[];
}
```

Implementation notes:

* Normalize weights if they do not sum to 1 or 100, but report normalization.
* Only simulate when sub-effect inputs are available.
* If insufficient inputs are available, return an explanatory error, not fabricated values.

## 6. Parser implementation

### 6.1 Common parser utilities

Implement helpers:

```ts
normalizeWhitespace(text)
parseNumber(text)
parseScore(text)
absoluteUrl(href, base)
extractLinks($, root)
sectionByHeading($, headingText)
```

### 6.2 Cases index parser

Target:

* `/cases`
* `/best-evidence`
* category pages if available

Extract:

* case title
* URL / slug
* case ID
* score
* date/year
* location
* category
* tags/status if present

### 6.3 Case page parser

Target individual case pages, e.g. RB-47 case.

Extract sections by headings:

* Title / subtitle
* Metadata block
* Score cards
* Effects present
* Investigations
* Government investigations
* Other investigations
* Sources
* Documents / spreadsheets
* Corroboration section
* Sub-effect analysis blocks

Parser should be tolerant of missing fields.

### 6.4 Methodology parser

Target:

* `/methodology`
* `/quick-walkthrough-ufoe-case-scoring/`
* `/lab`

Extract:

* score definitions
* effect categories
* sub-effects if listed
* weights
* probative factor definition and tiers
* caveats and interpretation guidance

## 7. Caching and rate limits

Implement:

```text
- In-memory cache by URL.
- Default TTL: 6 hours for case pages.
- Default TTL: 24 hours for methodology pages.
- Max concurrent requests: 2.
- User-Agent: "ufoe-mcp/0.1 (+contact-url-or-email)"
- Respect robots.txt if accessible.
```

Do not crawl the whole site on every server start. Lazy-load cases and refresh cache on demand.

## 8. Error handling

Return structured errors:

```ts
{
  error: {
    code: "NOT_FOUND" | "PARSE_ERROR" | "NETWORK_ERROR" | "INSUFFICIENT_DATA" | "UNSUPPORTED";
    message: string;
    sourceUrl?: string;
    details?: unknown;
  }
}
```

Examples:

* Case not found.
* Page fetched but expected score block absent.
* Spreadsheet link exists but cannot be downloaded.
* Simulation requested but sub-effect scores unavailable.

## 9. Provenance and safety rules

Every tool response must include:

```ts
{
  sourceUrl: string;
  retrievedAt: string;
}
```

For any score response, include this caveat:

```text
UFOe scores measure the quantity and quality of evidence under UFOe’s framework; they do not prove anomalous or nonhuman origin.
```

For any claim-tracing response, include:

```text
This traces the claim to UFOevidence.com text and listed sources; it does not independently verify the claim.
```

## 10. Tests

### Unit tests

Create fixture HTML from:

* `/cases`
* `/best-evidence`
* one strong case page, e.g. RB-47 or Nimitz
* `/lab`
* quick walkthrough
* methodology page

Test:

* case summaries parse correctly
* scores parse correctly
* effects parse correctly
* source links parse correctly
* missing fields do not crash parser
* weight simulation normalizes inputs
* claim tracing returns relevant sections

### Integration tests

Mock HTTP with fixture pages.

Test MCP tools end-to-end:

```text
search_cases -> get_case -> get_case_score -> get_case_effects -> trace_case_claim
```

## 11. README

Include:

* What this MCP server does.
* Installation.
* Running locally.
* MCP client config example.
* Tool list.
* Caveats about UFOe scoring.
* Rate-limit policy.
* Provenance policy.
* Known limitations.

Example config:

```json
{
  "mcpServers": {
    "ufoevidence": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "UFOE_CACHE_TTL_SECONDS": "21600"
      }
    }
  }
}
```

## 12. Milestones

### Milestone 1: Basic MCP server

* Create TypeScript MCP server.
* Add `get_methodology`.
* Add HTTP fetch/cache utilities.
* Add README skeleton.

### Milestone 2: Case discovery

* Implement `search_cases`.
* Implement cases index parser.
* Add tests for `/cases` and `/best-evidence`.

### Milestone 3: Case detail retrieval

* Implement `get_case`.
* Implement case page parser.
* Extract metadata, summary, scores, effects, sources.

### Milestone 4: Scoring tools

* Implement `get_case_score`.
* Implement `get_case_effects`.
* Implement `get_sub_effect_analysis`.
* Add score caveats.

### Milestone 5: Provenance tools

* Implement `get_case_sources`.
* Implement `trace_case_claim`.
* Add lexical matching for claim tracing.

### Milestone 6: Spreadsheet/document links

* Implement `get_case_spreadsheet`.
* Link-only first.
* Optional XLSX parsing later.

### Milestone 7: Case Lab simulation

* Implement scoring formulas.
* Implement `simulate_case_lab_weights`.
* Add tests against known default Case Lab outputs where possible.

## 13. Open questions

Before implementation, confirm these assumptions:

1. Should the MCP server be **read-only**, or should it support contribution/review tools later?
2. Should Codex use **TypeScript + official MCP SDK**, or do you prefer Python?
3. Should the server scrape public HTML only, or is there an undocumented/private API you want it to use if found?
4. Should spreadsheet downloads be parsed in v1, or should v1 only return spreadsheet links?
5. Is the target client Claude Desktop, Cursor, Codex CLI, or another MCP host?
6. Should the server include both `ufoevidence.com` and legacy `ufoevidence.org`, or only the new UFOevidence.com scoring site?
7. Should scoring simulation exactly reproduce UFOe Case Lab, or is approximate recalculation acceptable when some page-level inputs are missing?
