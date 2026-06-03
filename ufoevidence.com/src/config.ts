import { parseLogLevel, type LogLevel } from "./logger.js";

export type UfoeConfig = {
  baseUrl: string;
  databaseUrl: string;
  userAgent: string;
  cacheTtlSeconds: number;
  methodologyCacheTtlSeconds: number;
  maxConcurrentRequests: number;
  respectRobots: boolean;
  logLevel: LogLevel;
};

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return !["0", "false", "no"].includes(raw.toLowerCase());
}

export function loadConfig(): UfoeConfig {
  return {
    baseUrl: process.env.UFOE_BASE_URL ?? "https://ufoevidence.com",
    databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/ufoevidence.db",
    userAgent: process.env.UFOE_USER_AGENT ?? "ufoe-mcp/0.1 (+https://ufoevidence.com)",
    cacheTtlSeconds: readNumber("UFOE_CACHE_TTL_SECONDS", 21_600),
    methodologyCacheTtlSeconds: readNumber("UFOE_METHODOLOGY_CACHE_TTL_SECONDS", 86_400),
    maxConcurrentRequests: readNumber("UFOE_MAX_CONCURRENT_REQUESTS", 2),
    respectRobots: readBoolean("UFOE_RESPECT_ROBOTS", true),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
  };
}
