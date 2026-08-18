import { describe, expect, it, vi } from "vitest";
import { AppUserRole } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../../src/shared/kernel/errors";
import { UserManagementService } from "../../../src/modules/user-management/user-management.service";
import type { UserManagementRepository } from "../../../src/modules/user-management/user-management.repository";
import type { DomainEventBus } from "../../../src/shared/kernel/events";

function mockBus(): DomainEventBus {
  return { emit: vi.fn(), on: vi.fn() } as unknown as DomainEventBus;
}

describe("UserManagementService.linkAssignmentAccount", () => {
  it("rejects with ConflictError when no AppUser matches the email (never creates)", async () => {
    const create = vi.fn();
    const repo: UserManagementRepository = {
      list: vi.fn(),
      findById: vi.fn(),
      findByEmail: async () => null,
      create,
      update: vi.fn(),
      findAssignment: async () => ({
        id: "asg-1",
        deviceId: "dev-1",
        employeeUserId: null,
        managerUserId: null,
        isCurrent: true,
      }),
      linkAssignmentAccount: vi.fn(),
    };

    const service = new UserManagementService(repo, mockBus());
    await expect(
      service.linkAssignmentAccount("dev-1", "asg-1", { email: "missing@client.local", linkAs: "employee" }, "admin-1"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects when the assignment does not exist", async () => {
    const repo: UserManagementRepository = {
      list: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findAssignment: async () => null,
      linkAssignmentAccount: vi.fn(),
    };

    const service = new UserManagementService(repo, mockBus());
    await expect(
      service.linkAssignmentAccount("dev-1", "asg-1", { email: "priya.nair@client.local", linkAs: "employee" }, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects linking a non-EMPLOYEE as employee", async () => {
    const repo: UserManagementRepository = {
      list: vi.fn(),
      findById: vi.fn(),
      findByEmail: async () => ({
        id: "u-1",
        name: "Mgr",
        email: "sameer.kapoor@client.local",
        role: AppUserRole.CLIENT_MANAGER,
        isActive: true,
        createdAt: new Date(),
      }),
      create: vi.fn(),
      update: vi.fn(),
      findAssignment: async () => ({
        id: "asg-1",
        deviceId: "dev-1",
        employeeUserId: null,
        managerUserId: null,
        isCurrent: true,
      }),
      linkAssignmentAccount: vi.fn(),
    };

    const service = new UserManagementService(repo, mockBus());
    await expect(
      service.linkAssignmentAccount(
        "dev-1",
        "asg-1",
        { email: "sameer.kapoor@client.local", linkAs: "employee" },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
