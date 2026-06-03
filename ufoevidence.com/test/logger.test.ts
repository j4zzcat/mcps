import { describe, expect, it } from "vitest";
import { Logger, parseLogLevel } from "../src/logger.js";
import { UfoeToolError } from "../src/types/errors.js";

describe("parseLogLevel", () => {
  it("defaults to info when unset or unknown", () => {
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel("")).toBe("info");
    expect(parseLogLevel("verbose")).toBe("info");
  });

  it("parses MCP log levels and common aliases", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("WARN")).toBe("warning");
    expect(parseLogLevel("fatal")).toBe("critical");
  });
});

describe("Logger", () => {
  it("filters messages below the configured threshold", () => {
    const lines: string[] = [];
    const logger = new Logger({
      level: "warning",
      write: (line) => lines.push(line),
      now: () => new Date("2026-06-03T00:00:00.000Z"),
    });

    logger.info("hidden");
    logger.warning("visible", { tool: "get_case" });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: "2026-06-03T00:00:00.000Z",
      level: "warning",
      message: "visible",
      data: { tool: "get_case" },
    });
  });

  it("serializes structured errors without throwing", () => {
    const lines: string[] = [];
    const logger = new Logger({
      level: "debug",
      write: (line) => lines.push(line),
      now: () => new Date("2026-06-03T00:00:00.000Z"),
    });
    const error = new UfoeToolError("NETWORK_ERROR", "Failed", "https://example.test", { retryable: true });

    logger.error("Tool call failed.", { error });

    const entry = JSON.parse(lines[0]);
    expect(entry.data.error).toMatchObject({
      name: "Error",
      message: "Failed",
      code: "NETWORK_ERROR",
      sourceUrl: "https://example.test",
      details: { retryable: true },
    });
  });
});
