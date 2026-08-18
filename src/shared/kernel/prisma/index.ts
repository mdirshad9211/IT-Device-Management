import { PrismaClient } from "@prisma/client";
import { env } from "../../../config/env";

function resolveDatabaseUrl(): string {
  if (process.env.VITEST === "true" && env.TEST_DATABASE_URL) {
    return env.TEST_DATABASE_URL;
  }
  return env.DATABASE_URL;
}

/**
 * Single PrismaClient instance for the whole process. Repositories import
 * this — never instantiate `new PrismaClient()` anywhere else, and services
 * never import this directly (they depend on a repository interface,
 * injected via the awilix container — see config/container.ts).
 *
 * Vitest uses TEST_DATABASE_URL (docker-compose service postgres-test) when set.
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  datasources: { db: { url: resolveDatabaseUrl() } },
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
