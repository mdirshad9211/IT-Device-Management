import { PrismaClient } from "@prisma/client";
import { env } from "../../../config/env";

/**
 * Single PrismaClient instance for the whole process. Repositories import
 * this — never instantiate `new PrismaClient()` anywhere else, and services
 * never import this directly (they depend on a repository interface,
 * injected via the awilix container — see config/container.ts).
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
