import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db/client.js";
import { logger } from "./logger.js";
import { cacheAllCases, cacheAllCasesInput } from "./tools/cacheAllCases.js";
import { cacheCase, cacheCaseInput } from "./tools/cacheCase.js";
import { safeTool } from "./tools/common.js";
import { searchCachedCases, searchCachedCasesInput } from "./tools/searchCachedCases.js";
import { UfoeService } from "./tools/service.js";

export function createServer() {
  const config = loadConfig();
  const service = new UfoeService(config);
  const prisma = createPrismaClient(config.databaseUrl);
  const server = new McpServer({
    name: "ufoevidence-mcp",
    version: "0.1.0",
  });

  server.tool(
    "cache_case",
    "Fetch one UFOevidence.com case, including spreadsheet documents, and cache it in local SQLite.",
    cacheCaseInput,
    (input) => safeTool(() => cacheCase(service, prisma, input), { toolName: "cache_case" }),
  );

  server.tool(
    "cache_all_cases",
    "Fetch every UFOevidence.com case and cache each one in local SQLite using cache_case behavior.",
    cacheAllCasesInput,
    (input) => safeTool(() => cacheAllCases(service, prisma, input), { toolName: "cache_all_cases" }),
  );

  server.tool(
    "search_cached_cases",
    "Search locally cached UFOevidence.com cases in SQLite. To find the highest-scored case, use sortBy 'caseScore', sortOrder 'desc', and limit 1.",
    searchCachedCasesInput,
    (input) => safeTool(() => searchCachedCases(prisma, input), { toolName: "search_cached_cases" }),
  );

  logger.debug("MCP server created.", {
    baseUrl: config.baseUrl,
    databaseUrl: config.databaseUrl,
    logLevel: config.logLevel,
    respectRobots: config.respectRobots,
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected.", { transport: "stdio" });
}
