import { describe, expect, it, vi } from "vitest";
import { AppUserRole } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../../src/shared/kernel/errors";
import { ClientService } from "../../../src/modules/client/client.service";
import type { ClientRepository } from "../../../src/modules/client/client.repository";
import type { DomainEventBus } from "../../../src/shared/kernel/events";

function mockBus(): DomainEventBus {
  return { emit: vi.fn(), on: vi.fn() } as unknown as DomainEventBus;
}

function clientRecord(id: string, name: string) {
  return {
    id,
    name,
    currentLocation: "CRL Delhi",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("ClientService.listClients", () => {
  it("does not pass a client-id filter for unscoped roles", async () => {
    const list = vi.fn(async () => ({ items: [clientRecord("c1", "A")], total: 1 }));
    const listActiveAssignedClientIds = vi.fn();
    const repo = { list, listActiveAssignedClientIds } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await service.listClients({ page: 1, pageSize: 20 }, { userId: "admin-1", role: AppUserRole.SUPER_ADMIN });
    expect(listActiveAssignedClientIds).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith(0, 20, undefined);
  });

  it("filters IT_ENGINEER to active assigned client ids", async () => {
    const list = vi.fn(async () => ({ items: [clientRecord("assigned", "Assigned")], total: 1 }));
    const repo = {
      list,
      listActiveAssignedClientIds: async () => ["assigned"],
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    const result = await service.listClients(
      { page: 1, pageSize: 20 },
      { userId: "eng-1", role: AppUserRole.IT_ENGINEER },
    );
    expect(list).toHaveBeenCalledWith(0, 20, ["assigned"]);
    expect(result.items.map((c) => c.id)).toEqual(["assigned"]);
  });
});

describe("ClientService.changeLocation", () => {
  it("rejects a no-op move and never writes Device data", async () => {
    const changeLocation = vi.fn();
    const repo = {
      findById: async () => clientRecord("c1", "Site"),
      changeLocation,
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await expect(
      service.changeLocation("c1", { currentLocation: "CRL Delhi" }, "admin-1"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(changeLocation).not.toHaveBeenCalled();
  });

  it("emits client.location_changed after a successful move", async () => {
    const eventBus = mockBus();
    const repo: Partial<ClientRepository> = {
      findById: async () => clientRecord("c1", "Site"),
      changeLocation: async () => ({
        ...clientRecord("c1", "Site"),
        currentLocation: "CRL Mumbai",
        locations: [],
      }),
    };
    const service = new ClientService(repo as ClientRepository, eventBus);

    await service.changeLocation("c1", { currentLocation: "CRL Mumbai" }, "admin-1");
    expect(eventBus.emit).toHaveBeenCalledWith(
      "client.location_changed",
      expect.objectContaining({
        entityId: "c1",
        previousLocation: "CRL Delhi",
        newLocation: "CRL Mumbai",
      }),
    );
  });
});

describe("ClientService engineer assignment", () => {
  it("rejects assigning a non-engineer", async () => {
    const createEngineerAssignment = vi.fn();
    const repo = {
      findById: async () => clientRecord("c1", "Site"),
      findAppUserById: async () => ({ id: "u1", role: AppUserRole.EMPLOYEE, isActive: true }),
      createEngineerAssignment,
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await expect(service.assignEngineer("c1", { userId: "u1" }, "admin-1")).rejects.toBeInstanceOf(ValidationError);
    expect(createEngineerAssignment).not.toHaveBeenCalled();
  });

  it("conflicts when the engineer is already actively assigned", async () => {
    const repo = {
      findById: async () => clientRecord("c1", "Site"),
      findAppUserById: async () => ({ id: "eng-1", role: AppUserRole.IT_ENGINEER, isActive: true }),
      findActiveEngineerAssignment: async () => ({
        id: "asg-1",
        appUserId: "eng-1",
        clientId: "c1",
        isActive: true,
        assignedAt: new Date(),
        unassignedAt: null,
      }),
      createEngineerAssignment: vi.fn(),
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await expect(service.assignEngineer("c1", { userId: "eng-1" }, "admin-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("off-boards via assignment update only — never AppUser or Device writes", async () => {
    const offboardEngineerAssignment = vi.fn(async () => ({
      id: "asg-1",
      appUserId: "eng-1",
      clientId: "c1",
      isActive: false,
      assignedAt: new Date(),
      unassignedAt: new Date(),
    }));
    const repo = {
      findById: async () => clientRecord("c1", "Site"),
      findActiveEngineerAssignment: async () => ({
        id: "asg-1",
        appUserId: "eng-1",
        clientId: "c1",
        isActive: true,
        assignedAt: new Date(),
        unassignedAt: null,
      }),
      offboardEngineerAssignment,
      findAppUserById: vi.fn(),
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await service.offboardEngineer("c1", "eng-1", "admin-1");
    expect(offboardEngineerAssignment).toHaveBeenCalledWith("asg-1", expect.any(Date));
    expect(repo.findAppUserById).not.toHaveBeenCalled();
  });

  it("returns NotFoundError when off-boarding a missing assignment", async () => {
    const repo = {
      findById: async () => clientRecord("c1", "Site"),
      findActiveEngineerAssignment: async () => null,
      offboardEngineerAssignment: vi.fn(),
    } as unknown as ClientRepository;
    const service = new ClientService(repo, mockBus());

    await expect(service.offboardEngineer("c1", "eng-1", "admin-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
