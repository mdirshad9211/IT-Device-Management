import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { AppUserRole } from "@prisma/client";
import { prisma } from "../../../src/shared/kernel/prisma";

export async function resetClientTestData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "engineer_assignments", "site_locations", "clients", "app_users" RESTART IDENTITY CASCADE`,
  );
}

export async function createTestUser(input: {
  email: string;
  name: string;
  role: AppUserRole;
}): Promise<{ id: string }> {
  return prisma.appUser.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await bcrypt.hash("Password123!", 4),
    },
    select: { id: true },
  });
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
