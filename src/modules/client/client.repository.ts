import type { AppUser, Client, EngineerAssignment, Prisma, PrismaClient, SiteLocation } from "@prisma/client";

export const clientSelect = {
  id: true,
  name: true,
  currentLocation: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

export const siteLocationSelect = {
  id: true,
  locationName: true,
  isCurrent: true,
  changedAt: true,
} satisfies Prisma.SiteLocationSelect;

export const engineerAssignmentSelect = {
  id: true,
  appUserId: true,
  clientId: true,
  isActive: true,
  assignedAt: true,
  unassignedAt: true,
} satisfies Prisma.EngineerAssignmentSelect;

export type ClientRecord = Pick<Client, "id" | "name" | "currentLocation" | "createdAt" | "updatedAt">;
export type SiteLocationRecord = Pick<SiteLocation, "id" | "locationName" | "isCurrent" | "changedAt">;
export type EngineerAssignmentRecord = Pick<
  EngineerAssignment,
  "id" | "appUserId" | "clientId" | "isActive" | "assignedAt" | "unassignedAt"
>;
export type AppUserLookup = Pick<AppUser, "id" | "role" | "isActive">;

export type ClientWithLocations = ClientRecord & { locations: SiteLocationRecord[] };

export interface ClientRepository {
  create(data: { name: string; currentLocation: string }): Promise<ClientWithLocations>;
  list(skip: number, take: number, clientIds?: string[]): Promise<{ items: ClientRecord[]; total: number }>;
  findById(id: string): Promise<ClientRecord | null>;
  changeLocation(clientId: string, currentLocation: string): Promise<ClientWithLocations>;
  findAppUserById(id: string): Promise<AppUserLookup | null>;
  findActiveEngineerAssignment(clientId: string, appUserId: string): Promise<EngineerAssignmentRecord | null>;
  listActiveAssignedClientIds(appUserId: string): Promise<string[]>;
  createEngineerAssignment(clientId: string, appUserId: string): Promise<EngineerAssignmentRecord>;
  offboardEngineerAssignment(assignmentId: string, unassignedAt: Date): Promise<EngineerAssignmentRecord>;
}

export class PrismaClientRepository implements ClientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { name: string; currentLocation: string }): Promise<ClientWithLocations> {
    return this.prisma.client.create({
      data: {
        name: data.name,
        currentLocation: data.currentLocation,
        locations: {
          create: { locationName: data.currentLocation, isCurrent: true },
        },
      },
      select: {
        ...clientSelect,
        locations: { select: siteLocationSelect, orderBy: { changedAt: "asc" } },
      },
    });
  }

  async list(skip: number, take: number, clientIds?: string[]): Promise<{ items: ClientRecord[]; total: number }> {
    if (clientIds && clientIds.length === 0) {
      return { items: [], total: 0 };
    }

    const where: Prisma.ClientWhereInput = clientIds ? { id: { in: clientIds } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: clientSelect,
      }),
      this.prisma.client.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: string): Promise<ClientRecord | null> {
    return this.prisma.client.findUnique({ where: { id }, select: clientSelect });
  }

  /**
   * FR-MOVE-01 — updates Client.currentLocation and appends a SiteLocation row.
   * Touches only Client and SiteLocation (never Device).
   */
  async changeLocation(clientId: string, currentLocation: string): Promise<ClientWithLocations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.siteLocation.updateMany({
        where: { clientId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.siteLocation.create({
        data: { clientId, locationName: currentLocation, isCurrent: true },
      });
      return tx.client.update({
        where: { id: clientId },
        data: { currentLocation },
        select: {
          ...clientSelect,
          locations: { select: siteLocationSelect, orderBy: { changedAt: "asc" } },
        },
      });
    });
  }

  async findAppUserById(id: string): Promise<AppUserLookup | null> {
    return this.prisma.appUser.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
  }

  async findActiveEngineerAssignment(
    clientId: string,
    appUserId: string,
  ): Promise<EngineerAssignmentRecord | null> {
    return this.prisma.engineerAssignment.findFirst({
      where: { clientId, appUserId, isActive: true },
      select: engineerAssignmentSelect,
    });
  }

  async listActiveAssignedClientIds(appUserId: string): Promise<string[]> {
    const rows = await this.prisma.engineerAssignment.findMany({
      where: { appUserId, isActive: true },
      select: { clientId: true },
    });
    return rows.map((row) => row.clientId);
  }

  async createEngineerAssignment(clientId: string, appUserId: string): Promise<EngineerAssignmentRecord> {
    return this.prisma.engineerAssignment.create({
      data: { clientId, appUserId, isActive: true },
      select: engineerAssignmentSelect,
    });
  }

  /**
   * Off-boards by closing the assignment row only. Never writes AppUser or Device.
   */
  async offboardEngineerAssignment(assignmentId: string, unassignedAt: Date): Promise<EngineerAssignmentRecord> {
    return this.prisma.engineerAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false, unassignedAt },
      select: engineerAssignmentSelect,
    });
  }
}
