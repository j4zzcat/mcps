# UFOevidence.com MCP Server

Read-only MCP server for public UFOevidence.com case pages, scores, methodology, sources,
documents, and local Case Lab-style score simulation.

The server prioritizes faithful extraction and provenance. It does not authenticate, edit
site content, infer unsupported claims, or treat UFOe scores as proof of anomalous or
nonhuman origin.

## Install

```bash
npm install
npm run build
```

## Run

```bash
npm run dev
```

For an MCP host that launches built JavaScript:

```json
{
  "mcpServers": {
    "ufoevidence": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "UFOE_CACHE_TTL_SECONDS": "21600",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Docker

Build the local image:

```bash
docker build -t ufoevidence-mcp-local .
```

Run it directly:

```bash
docker run --rm -i \
  -v ufoevidence-mcp-data:/data \
  -e UFOE_CACHE_TTL_SECONDS=21600 \
  -e LOG_LEVEL=info \
  ufoevidence-mcp-local
```

For an MCP host that launches the server through Docker:

```json
{
  "mcpServers": {
    "ufoevidence": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "ufoevidence-mcp-data:/data",
        "-e",
        "UFOE_CACHE_TTL_SECONDS=21600",
        "-e",
        "LOG_LEVEL=info",
        "ufoevidence-mcp-local"
      ]
    }
  }
}
```

The server uses MCP over stdio, so keep `-i` and do not configure a port mapping.
SQLite cache tables are stored at `/data/ufoevidence.db` in the container. Mount
`ufoevidence-mcp-data:/data` or another persistent Docker volume at `/data` to keep cached
cases across container restarts.

## Logging

Logs are written as JSON lines to stderr so stdout remains reserved for MCP stdio protocol messages.

Set `LOG_LEVEL` to control verbosity. Supported levels, from least to most severe:
`debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.

Default:

```bash
LOG_LEVEL=info
```

## Tools

- `search_cases`: Search parsed case index data with filters.
- `get_case`: Retrieve a full case record.
- `get_case_score`: Retrieve top-line scores only.
- `get_case_effects`: Retrieve effect and sub-effect analysis.
- `get_sub_effect_analysis`: Retrieve one or all sub-effect records.
- `get_methodology`: Retrieve scoring methodology and default weights.
- `get_case_sources`: Retrieve sources, investigations, and documents.
- `trace_case_claim`: Lexically trace a claim to parsed case text and listed sources.
- `get_case_spreadsheet`: Return spreadsheet/scoring document links.
- `simulate_case_lab_weights`: Recalculate scores locally when page inputs are sufficient.
- `search_cached_cases`: Search cached SQLite case rows and sort by score, relevance, year, title, or cache timestamps.

## Caveats

UFOe scores measure the quantity and quality of evidence under UFOe's framework; they do not
prove anomalous or nonhuman origin.

Claim tracing searches UFOevidence.com text and listed sources. It does not independently
verify a claim.

## Rate Limits And Provenance

Requests are lazy-loaded and cached in memory. Defaults:

- Case pages: 6 hours
- Methodology pages: 24 hours
- Max concurrent requests: 2
- User-Agent: `ufoe-mcp/0.1 (+https://ufoevidence.com)`

Every tool response includes `sourceUrl` or `sourceUrls`, plus `retrievedAt` where a live page
or parsed record is involved.

## Known Limitations

- Parsers are tolerant static HTML extractors and may need adjustment if site templates differ.
- Spreadsheet support is link-only in v1.
- Browser automation and OCR are intentionally out of scope.
- Simulation returns structured insufficiency errors when sub-effect component inputs are absent.
