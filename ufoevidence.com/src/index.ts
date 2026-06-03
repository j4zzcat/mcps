#!/usr/bin/env node
import { logger } from "./logger.js";
import { runServer } from "./server.js";

runServer().catch((error) => {
  logger.error("MCP server crashed.", { error });
  process.exit(1);
});
