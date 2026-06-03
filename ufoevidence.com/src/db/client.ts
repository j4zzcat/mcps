import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

function ensureSqliteDirectory(databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) return;

  const filePath = databaseUrl.slice("file:".length);
  if (!filePath || filePath === ":memory:") return;

  const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  mkdirSync(dirname(resolved), { recursive: true });
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  ensureSqliteDirectory(databaseUrl);
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}
