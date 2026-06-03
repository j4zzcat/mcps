export const LOG_LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

type LoggerOptions = {
  level?: string;
  write?: (line: string) => void;
  now?: () => Date;
};

const LOG_LEVEL_ALIASES: Record<string, LogLevel> = {
  warn: "warning",
  fatal: "critical",
};

const DEFAULT_LOG_LEVEL: LogLevel = "info";

function normalizeError(error: Error, seen: WeakSet<object>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  for (const [key, value] of Object.entries(error)) {
    normalized[key] = normalizeData(value, seen);
  }

  return normalized;
}

function normalizeData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (value instanceof Error) return normalizeError(value, seen);
    if (Array.isArray(value)) return value.map((item) => normalizeData(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeData(item, seen)]));
  }
  return value;
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

function severity(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

export function parseLogLevel(raw: string | undefined): LogLevel {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) return DEFAULT_LOG_LEVEL;
  if (isLogLevel(normalized)) return normalized;
  return LOG_LEVEL_ALIASES[normalized] ?? DEFAULT_LOG_LEVEL;
}

export class Logger {
  private readonly threshold: LogLevel;
  private readonly write: (line: string) => void;
  private readonly now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.threshold = parseLogLevel(options.level);
    this.write = options.write ?? ((line) => process.stderr.write(`${line}\n`));
    this.now = options.now ?? (() => new Date());
  }

  isEnabled(level: LogLevel): boolean {
    return severity(level) >= severity(this.threshold);
  }

  log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.isEnabled(level)) return;

    const entry = {
      timestamp: this.now().toISOString(),
      level,
      message,
      ...(data ? { data: normalizeData(data) } : {}),
    };

    this.write(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  notice(message: string, data?: Record<string, unknown>): void {
    this.log("notice", message, data);
  }

  warning(message: string, data?: Record<string, unknown>): void {
    this.log("warning", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  critical(message: string, data?: Record<string, unknown>): void {
    this.log("critical", message, data);
  }

  alert(message: string, data?: Record<string, unknown>): void {
    this.log("alert", message, data);
  }

  emergency(message: string, data?: Record<string, unknown>): void {
    this.log("emergency", message, data);
  }
}

export const logger = new Logger({ level: process.env.LOG_LEVEL });
