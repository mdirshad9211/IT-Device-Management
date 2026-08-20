import type {
  OtherDeviceStatus,
  OtherDeviceType,
  OtherNetworkDevice,
  Prisma,
  PrismaClient,
  WarrantyStatus,
} from "@prisma/client";

export const otherNetworkDeviceSelect = {
  id: true,
  clientId: true,
  type: true,
  name: true,
  serialNumber: true,
  purchaseDate: true,
  status: true,
  attachedDeviceId: true,
  warrantyStatus: true,
  warrantyExpiryDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OtherNetworkDeviceSelect;

export type OtherNetworkDeviceRecord = Pick<
  OtherNetworkDevice,
  | "id"
  | "clientId"
  | "type"
  | "name"
  | "serialNumber"
  | "purchaseDate"
  | "status"
  | "attachedDeviceId"
  | "warrantyStatus"
  | "warrantyExpiryDate"
  | "createdAt"
  | "updatedAt"
>;

export type CreateOtherNetworkDeviceData = {
  clientId: string;
  type: OtherDeviceType;
  name: string;
  serialNumber: string | null;
  purchaseDate: Date | null;
  status: OtherDeviceStatus;
  warrantyStatus: WarrantyStatus;
  warrantyExpiryDate: Date | null;
};

export type UpdateOtherNetworkDeviceData = {
  type?: OtherDeviceType;
  name?: string;
  serialNumber?: string | null;
  purchaseDate?: Date | null;
  status?: OtherDeviceStatus;
  warrantyStatus?: WarrantyStatus;
  warrantyExpiryDate?: Date | null;
};

export type OtherNetworkDeviceListFilter = {
  clientIds?: string[];
  clientId?: string;
  status?: OtherDeviceStatus;
  attachedDeviceId?: string;
};

export interface OtherNetworkDeviceRepository {
  clientExists(clientId: string): Promise<boolean>;
  deviceExists(deviceId: string): Promise<{ id: string; clientId: string } | null>;
  listActiveAssignedClientIds(appUserId: string): Promise<string[]>;
  create(data: CreateOtherNetworkDeviceData): Promise<OtherNetworkDeviceRecord>;
  update(id: string, data: UpdateOtherNetworkDeviceData): Promise<OtherNetworkDeviceRecord>;
  findById(id: string): Promise<OtherNetworkDeviceRecord | null>;
  list(
    skip: number,
    take: number,
    filter: OtherNetworkDeviceListFilter,
  ): Promise<{ items: OtherNetworkDeviceRecord[]; total: number }>;
  setAttachedDevice(id: string, attachedDeviceId: string | null): Promise<OtherNetworkDeviceRecord>;
  listByAttachedDeviceId(deviceId: string): Promise<OtherNetworkDeviceRecord[]>;
  listByAttachedDeviceIds(deviceIds: string[]): Promise<OtherNetworkDeviceRecord[]>;
  delete(id: string): Promise<void>;
}

export class PrismaOtherNetworkDeviceRepository implements OtherNetworkDeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async clientExists(clientId: string): Promise<boolean> {
    const row = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    return row !== null;
  }

  async deviceExists(deviceId: string): Promise<{ id: string; clientId: string } | null> {
    return this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, clientId: true },
    });
  }

  async listActiveAssignedClientIds(appUserId: string): Promise<string[]> {
    const rows = await this.prisma.engineerAssignment.findMany({
      where: { appUserId, isActive: true },
      select: { clientId: true },
    });
    return rows.map((row) => row.clientId);
  }

  async create(data: CreateOtherNetworkDeviceData): Promise<OtherNetworkDeviceRecord> {
    return this.prisma.otherNetworkDevice.create({
      data,
      select: otherNetworkDeviceSelect,
    });
  }

  async update(id: string, data: UpdateOtherNetworkDeviceData): Promise<OtherNetworkDeviceRecord> {
    return this.prisma.otherNetworkDevice.update({
      where: { id },
      data,
      select: otherNetworkDeviceSelect,
    });
  }

  async findById(id: string): Promise<OtherNetworkDeviceRecord | null> {
    return this.prisma.otherNetworkDevice.findUnique({
      where: { id },
      select: otherNetworkDeviceSelect,
    });
  }

  async list(
    skip: number,
    take: number,
    filter: OtherNetworkDeviceListFilter,
  ): Promise<{ items: OtherNetworkDeviceRecord[]; total: number }> {
    if (filter.clientIds && filter.clientIds.length === 0) {
      return { items: [], total: 0 };
    }

    const where = this.toWhere(filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.otherNetworkDevice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: otherNetworkDeviceSelect,
      }),
      this.prisma.otherNetworkDevice.count({ where }),
    ]);
    return { items, total };
  }

  async setAttachedDevice(id: string, attachedDeviceId: string | null): Promise<OtherNetworkDeviceRecord> {
    return this.prisma.otherNetworkDevice.update({
      where: { id },
      data: { attachedDeviceId },
      select: otherNetworkDeviceSelect,
    });
  }

  async listByAttachedDeviceId(deviceId: string): Promise<OtherNetworkDeviceRecord[]> {
    return this.prisma.otherNetworkDevice.findMany({
      where: { attachedDeviceId: deviceId },
      orderBy: { name: "asc" },
      select: otherNetworkDeviceSelect,
    });
  }

  async listByAttachedDeviceIds(deviceIds: string[]): Promise<OtherNetworkDeviceRecord[]> {
    if (deviceIds.length === 0) {
      return [];
    }
    return this.prisma.otherNetworkDevice.findMany({
      where: { attachedDeviceId: { in: deviceIds } },
      orderBy: { name: "asc" },
      select: otherNetworkDeviceSelect,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.otherNetworkDevice.delete({ where: { id } });
  }

  private toWhere(filter: OtherNetworkDeviceListFilter): Prisma.OtherNetworkDeviceWhereInput {
    const where: Prisma.OtherNetworkDeviceWhereInput = {};
    if (filter.clientIds) {
      where.clientId = { in: filter.clientIds };
    }
    if (filter.clientId) {
      where.clientId = filter.clientIds
        ? { in: filter.clientIds.filter((id) => id === filter.clientId) }
        : filter.clientId;
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.attachedDeviceId) {
      where.attachedDeviceId = filter.attachedDeviceId;
    }
    return where;
  }
}
