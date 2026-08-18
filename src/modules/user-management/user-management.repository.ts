import type { AppUser, AppUserRole, DeviceAssignment, Prisma, PrismaClient } from "@prisma/client";

export const appUserPublicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.AppUserSelect;

export type AppUserPublicRecord = Pick<AppUser, "id" | "name" | "email" | "role" | "isActive" | "createdAt">;

export type DeviceAssignmentLinkRecord = Pick<
  DeviceAssignment,
  "id" | "deviceId" | "employeeUserId" | "managerUserId" | "isCurrent"
>;

export type CreateAppUserRecord = {
  name: string;
  email: string;
  passwordHash: string;
  role: AppUserRole;
  isActive: boolean;
};

export type UpdateAppUserRecord = {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: AppUserRole;
  isActive?: boolean;
};

export interface UserManagementRepository {
  list(skip: number, take: number): Promise<{ items: AppUserPublicRecord[]; total: number }>;
  findById(id: string): Promise<AppUserPublicRecord | null>;
  findByEmail(email: string): Promise<AppUserPublicRecord | null>;
  create(data: CreateAppUserRecord): Promise<AppUserPublicRecord>;
  update(id: string, data: UpdateAppUserRecord): Promise<AppUserPublicRecord>;
  findAssignment(deviceId: string, assignmentId: string): Promise<DeviceAssignmentLinkRecord | null>;
  linkAssignmentAccount(
    assignmentId: string,
    patch: { employeeUserId?: string; managerUserId?: string },
  ): Promise<DeviceAssignmentLinkRecord>;
}

export class PrismaUserManagementRepository implements UserManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(skip: number, take: number): Promise<{ items: AppUserPublicRecord[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appUser.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: appUserPublicSelect,
      }),
      this.prisma.appUser.count(),
    ]);
    return { items, total };
  }

  async findById(id: string): Promise<AppUserPublicRecord | null> {
    return this.prisma.appUser.findUnique({ where: { id }, select: appUserPublicSelect });
  }

  async findByEmail(email: string): Promise<AppUserPublicRecord | null> {
    return this.prisma.appUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: appUserPublicSelect,
    });
  }

  async create(data: CreateAppUserRecord): Promise<AppUserPublicRecord> {
    return this.prisma.appUser.create({ data, select: appUserPublicSelect });
  }

  /**
   * Updates AppUser columns only. Never writes EngineerAssignment or Device rows.
   */
  async update(id: string, data: UpdateAppUserRecord): Promise<AppUserPublicRecord> {
    return this.prisma.appUser.update({ where: { id }, data, select: appUserPublicSelect });
  }

  async findAssignment(deviceId: string, assignmentId: string): Promise<DeviceAssignmentLinkRecord | null> {
    return this.prisma.deviceAssignment.findFirst({
      where: { id: assignmentId, deviceId },
      select: { id: true, deviceId: true, employeeUserId: true, managerUserId: true, isCurrent: true },
    });
  }

  async linkAssignmentAccount(
    assignmentId: string,
    patch: { employeeUserId?: string; managerUserId?: string },
  ): Promise<DeviceAssignmentLinkRecord> {
    return this.prisma.deviceAssignment.update({
      where: { id: assignmentId },
      data: patch,
      select: { id: true, deviceId: true, employeeUserId: true, managerUserId: true, isCurrent: true },
    });
  }
}
