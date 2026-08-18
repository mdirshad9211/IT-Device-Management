import type { Agent, AppUser, PrismaClient } from "@prisma/client";

export type AppUserWithPassword = Pick<AppUser, "id" | "name" | "email" | "role" | "isActive" | "passwordHash">;

export type AgentAuthRecord = Pick<Agent, "id" | "deviceId" | "clientId" | "apiKeyHash">;

export interface AuthRepository {
  findActiveByEmail(email: string): Promise<AppUserWithPassword | null>;
  findAgentByApiKeyHash(apiKeyHash: string): Promise<AgentAuthRecord | null>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByEmail(email: string): Promise<AppUserWithPassword | null> {
    return this.prisma.appUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true, passwordHash: true },
    });
  }

  async findAgentByApiKeyHash(apiKeyHash: string): Promise<AgentAuthRecord | null> {
    return this.prisma.agent.findFirst({
      where: { apiKeyHash },
      select: { id: true, deviceId: true, clientId: true, apiKeyHash: true },
    });
  }
}
