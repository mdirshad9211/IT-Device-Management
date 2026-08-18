import { describe, expect, it } from "vitest";
import { AuthService } from "../../../src/modules/auth/auth.service";
import { AppUserRole } from "@prisma/client";
import bcrypt from "bcrypt";
import { UnauthorizedError } from "../../../src/shared/kernel/errors";
import type { AuthRepository } from "../../../src/modules/auth/auth.repository";
import { hashAgentApiKey } from "../../../src/modules/auth/agent-api-key";

describe("AuthService.login", () => {
  it("returns public user fields when email and password match an active user", async () => {
    const passwordHash = await bcrypt.hash("secret-pass", 10);
    const repo: AuthRepository = {
      findActiveByEmail: async () => ({
        id: "user-1",
        name: "Super Admin",
        email: "super.admin@inventory.local",
        role: AppUserRole.SUPER_ADMIN,
        isActive: true,
        passwordHash,
      }),
      findAgentByApiKeyHash: async () => null,
    };

    const service = new AuthService(repo);
    const user = await service.login({ email: "super.admin@inventory.local", password: "secret-pass" });
    expect(user).toEqual({
      id: "user-1",
      name: "Super Admin",
      email: "super.admin@inventory.local",
      role: AppUserRole.SUPER_ADMIN,
    });
  });

  it("throws UnauthorizedError for a wrong password", async () => {
    const passwordHash = await bcrypt.hash("secret-pass", 10);
    const repo: AuthRepository = {
      findActiveByEmail: async () => ({
        id: "user-1",
        name: "Super Admin",
        email: "super.admin@inventory.local",
        role: AppUserRole.SUPER_ADMIN,
        isActive: true,
        passwordHash,
      }),
      findAgentByApiKeyHash: async () => null,
    };

    const service = new AuthService(repo);
    await expect(service.login({ email: "super.admin@inventory.local", password: "nope" })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe("hashAgentApiKey", () => {
  it("is deterministic and distinct from the raw key", () => {
    const a = hashAgentApiKey("site-key-1");
    const b = hashAgentApiKey("site-key-1");
    expect(a).toBe(b);
    expect(a).not.toBe("site-key-1");
    expect(a).toHaveLength(64);
  });
});
