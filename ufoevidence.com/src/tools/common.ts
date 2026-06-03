import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../logger.js";
import { UfoeToolError } from "../types/errors.js";

type ToolLogContext = {
  toolName: string;
};

export function jsonResponse(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorResponse(error: unknown): CallToolResult {
  if (error instanceof UfoeToolError) {
    return jsonResponse({
      error: {
        code: error.code,
        message: error.message,
        sourceUrl: error.sourceUrl,
        details: error.details,
      },
    });
  }

  return jsonResponse({
    error: {
      code: "PARSE_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error,
    },
  });
}

export async function safeTool<T>(operation: () => Promise<T>, context: ToolLogContext): Promise<CallToolResult> {
  logger.debug("Tool call started.", { tool: context.toolName });

  try {
    const result = await operation();
    logger.debug("Tool call completed.", { tool: context.toolName });
    return jsonResponse(result);
  } catch (error) {
    logger.error("Tool call failed.", { tool: context.toolName, error });
    return errorResponse(error);
  }
}

export function lexicalScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);

  if (!terms.length) return 0;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}
