import { describe, expect, it, vi } from "vitest";
import { AppUserRole } from "@prisma/client";
import { NotFoundError } from "../../../src/shared/kernel/errors";
import { UserManagementService } from "../../../src/modules/user-management/user-management.service";
import type { UserManagementRepository } from "../../../src/modules/user-management/user-management.repository";
import type { DomainEventBus } from "../../../src/shared/kernel/events";

function mockBus(): DomainEventBus {
  return { emit: vi.fn(), on: vi.fn() } as unknown as DomainEventBus;
}

function baseUser() {
  return {
    id: "user-1",
    name: "Priya Nair",
    email: "priya.nair@client.local",
    role: AppUserRole.EMPLOYEE,
    isActive: true,
    createdAt: new Date(),
  };
}

describe("UserManagementService.updateUser", () => {
  it("toggles isActive via AppUser update only — never EngineerAssignment or Device writes", async () => {
    const linkAssignmentAccount = vi.fn();
    const repo: UserManagementRepository = {
      list: vi.fn(),
      findById: async () => baseUser(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: async (_id: string, data: { isActive?: boolean }) => ({
        ...baseUser(),
        isActive: data.isActive ?? true,
      }),
      findAssignment: vi.fn(),
      linkAssignmentAccount,
    };

    const service = new UserManagementService(repo, mockBus());
    const updated = await service.updateUser("user-1", { isActive: false }, "admin-1");
    expect(updated.isActive).toBe(false);
    expect(linkAssignmentAccount).not.toHaveBeenCalled();
    expect(repo.findAssignment).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the user does not exist", async () => {
    const repo: UserManagementRepository = {
      list: vi.fn(),
      findById: async () => null,
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findAssignment: vi.fn(),
      linkAssignmentAccount: vi.fn(),
    };

    const service = new UserManagementService(repo, mockBus());
    await expect(service.updateUser("missing", { isActive: false }, "admin-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
