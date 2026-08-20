import type {
  Device,
  DeviceAssignment,
  DeviceHardwareChangeEvent,
  DeviceSoftwareEvent,
  Prisma,
  PrismaClient,
  QrCode,
} from "@prisma/client";
import { DeviceStatus } from "@prisma/client";
import type { AssignmentInput } from "./device.schemas";
import type { LifecyclePlan } from "./device.lifecycle";
import type { LifecycleEventType } from "@prisma/client";

export const deviceSelect = {
  id: true,
  clientId: true,
  assetTag: true,
  cpu: true,
  ram: true,
  storageTotal: true,
  storageUsedPercent: true,
  pciCards: true,
  soundCards: true,
  connectedDevices: true,
  installedSoftware: true,
  status: true,
  discardedAt: true,
  deletionDueAt: true,
  discardWarningSentAt: true,
  retiredFlag: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DeviceSelect;

export const assignmentSelect = {
  id: true,
  deviceId: true,
  userName: true,
  userPhone: true,
  userEmail: true,
  department: true,
  managerName: true,
  managerPhone: true,
  managerEmail: true,
  employeeUserId: true,
  managerUserId: true,
  managerAcknowledgedAt: true,
  isCurrent: true,
  assignedAt: true,
  unassignedAt: true,
} satisfies Prisma.DeviceAssignmentSelect;

export const qrSelect = {
  id: true,
  deviceId: true,
  qrValue: true,
  printCount: true,
  createdAt: true,
} satisfies Prisma.QrCodeSelect;

export type DeviceRecord = Pick<
  Device,
  | "id"
  | "clientId"
  | "assetTag"
  | "cpu"
  | "ram"
  | "storageTotal"
  | "storageUsedPercent"
  | "pciCards"
  | "soundCards"
  | "connectedDevices"
  | "installedSoftware"
  | "status"
  | "discardedAt"
  | "deletionDueAt"
  | "discardWarningSentAt"
  | "retiredFlag"
  | "createdAt"
  | "updatedAt"
>;

export type AssignmentRecord = Pick<
  DeviceAssignment,
  | "id"
  | "deviceId"
  | "userName"
  | "userPhone"
  | "userEmail"
  | "department"
  | "managerName"
  | "managerPhone"
  | "managerEmail"
  | "employeeUserId"
  | "managerUserId"
  | "managerAcknowledgedAt"
  | "isCurrent"
  | "assignedAt"
  | "unassignedAt"
>;

export type QrRecord = Pick<QrCode, "id" | "deviceId" | "qrValue" | "printCount" | "createdAt">;

export type DeviceDetail = DeviceRecord & {
  qrCode: QrRecord | null;
  currentAssignment: AssignmentRecord | null;
};

export type ManagerLookupRow = { name: string; email: string; phone: string | null; userId: string | null };

export type AllotmentData = {
  clientId: string;
  assetTag: string;
  cpu?: string;
  ram?: string;
  storageTotal?: string;
  storageUsedPercent?: number;
  pciCards?: Prisma.InputJsonValue;
  soundCards?: Prisma.InputJsonValue;
  connectedDevices?: Prisma.InputJsonValue;
  installedSoftware?: Prisma.InputJsonValue;
  assignment: AssignmentInput;
};

export type DeviceListFilter = {
  clientIds?: string[];
  clientId?: string;
  status?: DeviceStatus;
  managerUserId?: string;
  employeeUserId?: string;
};

export type DeviceUpdateData = {
  cpu?: string | null;
  ram?: string | null;
  storageTotal?: string | null;
  storageUsedPercent?: number | null;
  pciCards?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  soundCards?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  connectedDevices?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  installedSoftware?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

/** Minimal row for the lifecycle sweep (delete + discard warning). */
export type SweepDeviceRow = {
  id: string;
  clientId: string;
  assetTag: string;
  status: DeviceStatus;
  deletionDueAt: Date | null;
  discardWarningSentAt: Date | null;
  userEmail: string | null;
  managerEmail: string | null;
};

function toDetail(row: DeviceRecord & { qrCode: QrRecord | null; assignments: AssignmentRecord[] }): DeviceDetail {
  return {
    ...pickDevice(row),
    qrCode: row.qrCode,
    currentAssignment: row.assignments[0] ?? null,
  };
}

function pickDevice(row: DeviceRecord): DeviceRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    assetTag: row.assetTag,
    cpu: row.cpu,
    ram: row.ram,
    storageTotal: row.storageTotal,
    storageUsedPercent: row.storageUsedPercent,
    pciCards: row.pciCards,
    soundCards: row.soundCards,
    connectedDevices: row.connectedDevices,
    installedSoftware: row.installedSoftware,
    status: row.status,
    discardedAt: row.discardedAt,
    deletionDueAt: row.deletionDueAt,
    discardWarningSentAt: row.discardWarningSentAt,
    retiredFlag: row.retiredFlag,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface DeviceRepository {
  clientExists(clientId: string): Promise<boolean>;
  listActiveAssignedClientIds(appUserId: string): Promise<string[]>;
  allot(
    data: AllotmentData,
    generateQr: (tx: Prisma.TransactionClient, deviceId: string) => Promise<unknown>,
  ): Promise<DeviceDetail>;
  list(skip: number, take: number, filter: DeviceListFilter): Promise<{ items: DeviceDetail[]; total: number }>;
  findById(id: string): Promise<DeviceDetail | null>;
  update(id: string, data: DeviceUpdateData): Promise<DeviceDetail>;
  changeAssignment(deviceId: string, assignment: AssignmentInput): Promise<AssignmentRecord>;
  applyLifecycle(
    deviceId: string,
    plan: LifecyclePlan,
    eventType: LifecycleEventType,
    actorUserId: string,
  ): Promise<DeviceDetail>;
  lookupManagers(query: string): Promise<ManagerLookupRow[]>;
  listSoftwareHistory(
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ items: DeviceSoftwareEvent[]; total: number }>;
  listHardwareHistory(
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ items: DeviceHardwareChangeEvent[]; total: number }>;
  /** DISCARDED devices with deletionDueAt <= now (hard-delete candidates). */
  listDueForHardDelete(now: Date): Promise<SweepDeviceRow[]>;
  /**
   * DISCARDED devices whose deletionDueAt falls within (now, now+warnWithinDays]
   * and that have not yet been warned (`discardWarningSentAt` is null).
   */
  listDueForDiscardWarning(now: Date, warnWithinDays: number): Promise<SweepDeviceRow[]>;
  /**
   * Atomically sets discardWarningSentAt when still null. Returns true if this
   * caller won the race (idempotent warn).
   */
  claimDiscardWarning(deviceId: string, sentAt: Date): Promise<boolean>;
  /** Permanently removes a device and dependent rows (FK-safe order). */
  hardDeleteDevice(deviceId: string): Promise<void>;
}

export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async clientExists(clientId: string): Promise<boolean> {
    const row = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    return row !== null;
  }

  async listActiveAssignedClientIds(appUserId: string): Promise<string[]> {
    const rows = await this.prisma.engineerAssignment.findMany({
      where: { appUserId, isActive: true },
      select: { clientId: true },
    });
    return rows.map((row) => row.clientId);
  }

  /**
   * SRS §3.2 allotment — Device + current DeviceAssignment + QR in one transaction.
   * No Device row remains if any step fails.
   */
  async allot(
    data: AllotmentData,
    generateQr: (tx: Prisma.TransactionClient, deviceId: string) => Promise<unknown>,
  ): Promise<DeviceDetail> {
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          clientId: data.clientId,
          assetTag: data.assetTag,
          cpu: data.cpu,
          ram: data.ram,
          storageTotal: data.storageTotal,
          storageUsedPercent: data.storageUsedPercent,
          pciCards: data.pciCards,
          soundCards: data.soundCards,
          connectedDevices: data.connectedDevices,
          installedSoftware: data.installedSoftware,
          assignments: {
            create: { ...data.assignment, isCurrent: true },
          },
        },
        select: { id: true, assetTag: true },
      });
      await generateQr(tx, device.id);
      const full = await tx.device.findUniqueOrThrow({
        where: { id: device.id },
        select: { ...deviceSelect, qrCode: { select: qrSelect }, assignments: { where: { isCurrent: true }, select: assignmentSelect, take: 1 } },
      });
      return toDetail(full);
    });
  }

  async list(skip: number, take: number, filter: DeviceListFilter): Promise<{ items: DeviceDetail[]; total: number }> {
    if (filter.clientIds && filter.clientIds.length === 0) {
      return { items: [], total: 0 };
    }

    const where = this.toWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          ...deviceSelect,
          qrCode: { select: qrSelect },
          assignments: { where: { isCurrent: true }, select: assignmentSelect, take: 1 },
        },
      }),
      this.prisma.device.count({ where }),
    ]);
    return { items: rows.map(toDetail), total };
  }

  async findById(id: string): Promise<DeviceDetail | null> {
    const row = await this.prisma.device.findUnique({
      where: { id },
      select: {
        ...deviceSelect,
        qrCode: { select: qrSelect },
        assignments: { where: { isCurrent: true }, select: assignmentSelect, take: 1 },
      },
    });
    return row ? toDetail(row) : null;
  }

  async update(id: string, data: DeviceUpdateData): Promise<DeviceDetail> {
    const row = await this.prisma.device.update({
      where: { id },
      data,
      select: {
        ...deviceSelect,
        qrCode: { select: qrSelect },
        assignments: { where: { isCurrent: true }, select: assignmentSelect, take: 1 },
      },
    });
    return toDetail(row);
  }

  /**
   * User-on-device change: close the current assignment, insert a new current
   * row. Device.id and QrCode are never written.
   */
  async changeAssignment(deviceId: string, assignment: AssignmentInput): Promise<AssignmentRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.deviceAssignment.updateMany({
        where: { deviceId, isCurrent: true },
        data: { isCurrent: false, unassignedAt: new Date() },
      });
      return tx.deviceAssignment.create({
        data: { ...assignment, deviceId, isCurrent: true },
        select: assignmentSelect,
      });
    });
  }

  async applyLifecycle(
    deviceId: string,
    plan: LifecyclePlan,
    eventType: LifecycleEventType,
    actorUserId: string,
  ): Promise<DeviceDetail> {
    return this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: {
          status: plan.status,
          discardedAt: plan.discardedAt,
          deletionDueAt: plan.deletionDueAt,
          retiredFlag: plan.retiredFlag,
          ...(plan.discardWarningSentAt !== undefined
            ? { discardWarningSentAt: plan.discardWarningSentAt }
            : {}),
        },
      });
      await tx.deviceLifecycleEvent.create({
        data: {
          deviceId,
          eventType,
          performedBy: actorUserId,
          metadata: {
            status: plan.status,
            discardedAt: plan.discardedAt?.toISOString() ?? null,
            deletionDueAt: plan.deletionDueAt?.toISOString() ?? null,
            retiredFlag: plan.retiredFlag,
          },
        },
      });
      const row = await tx.device.findUniqueOrThrow({
        where: { id: deviceId },
        select: {
          ...deviceSelect,
          qrCode: { select: qrSelect },
          assignments: { where: { isCurrent: true }, select: assignmentSelect, take: 1 },
        },
      });
      return toDetail(row);
    });
  }

  async lookupManagers(query: string): Promise<ManagerLookupRow[]> {
    const users = await this.prisma.appUser.findMany({
      where: {
        role: "CLIENT_MANAGER",
        isActive: true,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: { id: true, name: true, email: true },
    });

    const fromUsers: ManagerLookupRow[] = users.map((user) => ({
      name: user.name,
      email: user.email,
      phone: null,
      userId: user.id,
    }));

    const assignments = await this.prisma.deviceAssignment.findMany({
      where: {
        OR: [
          { managerName: { contains: query, mode: "insensitive" } },
          { managerEmail: { contains: query, mode: "insensitive" } },
        ],
      },
      distinct: ["managerEmail"],
      take: 10,
      select: { managerName: true, managerEmail: true, managerPhone: true, managerUserId: true },
    });

    const seen = new Set(fromUsers.map((row) => row.email.toLowerCase()));
    const merged = [...fromUsers];
    for (const row of assignments) {
      const key = row.managerEmail.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        name: row.managerName,
        email: row.managerEmail,
        phone: row.managerPhone,
        userId: row.managerUserId,
      });
    }
    return merged.slice(0, 10);
  }

  async listSoftwareHistory(
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ items: DeviceSoftwareEvent[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.deviceSoftwareEvent.findMany({
        where: { deviceId },
        skip,
        take,
        orderBy: { detectedAt: "desc" },
      }),
      this.prisma.deviceSoftwareEvent.count({ where: { deviceId } }),
    ]);
    return { items, total };
  }

  async listHardwareHistory(
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ items: DeviceHardwareChangeEvent[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.deviceHardwareChangeEvent.findMany({
        where: { deviceId },
        skip,
        take,
        orderBy: { detectedAt: "desc" },
      }),
      this.prisma.deviceHardwareChangeEvent.count({ where: { deviceId } }),
    ]);
    return { items, total };
  }

  async listDueForHardDelete(now: Date): Promise<SweepDeviceRow[]> {
    const rows = await this.prisma.device.findMany({
      where: {
        status: DeviceStatus.DISCARDED,
        deletionDueAt: { lte: now },
      },
      select: {
        id: true,
        clientId: true,
        assetTag: true,
        status: true,
        deletionDueAt: true,
        discardWarningSentAt: true,
        assignments: {
          where: { isCurrent: true },
          select: { userEmail: true, managerEmail: true },
          take: 1,
        },
      },
    });
    return rows.map(toSweepRow);
  }

  async listDueForDiscardWarning(now: Date, warnWithinDays: number): Promise<SweepDeviceRow[]> {
    const warnUntil = new Date(now.getTime());
    warnUntil.setUTCDate(warnUntil.getUTCDate() + warnWithinDays);
    const rows = await this.prisma.device.findMany({
      where: {
        status: DeviceStatus.DISCARDED,
        discardWarningSentAt: null,
        deletionDueAt: { gt: now, lte: warnUntil },
      },
      select: {
        id: true,
        clientId: true,
        assetTag: true,
        status: true,
        deletionDueAt: true,
        discardWarningSentAt: true,
        assignments: {
          where: { isCurrent: true },
          select: { userEmail: true, managerEmail: true },
          take: 1,
        },
      },
    });
    return rows.map(toSweepRow);
  }

  async claimDiscardWarning(deviceId: string, sentAt: Date): Promise<boolean> {
    const result = await this.prisma.device.updateMany({
      where: { id: deviceId, discardWarningSentAt: null, status: DeviceStatus.DISCARDED },
      data: { discardWarningSentAt: sentAt },
    });
    return result.count === 1;
  }

  async hardDeleteDevice(deviceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({ where: { deviceId }, data: { deviceId: null } });
      await tx.otherNetworkDevice.updateMany({
        where: { attachedDeviceId: deviceId },
        data: { attachedDeviceId: null },
      });

      await tx.deviceSoftwareEvent.deleteMany({ where: { deviceId } });
      await tx.deviceHardwareChangeEvent.deleteMany({ where: { deviceId } });
      await tx.deviceLifecycleEvent.deleteMany({ where: { deviceId } });
      await tx.deviceAssignment.deleteMany({ where: { deviceId } });
      await tx.qrCode.deleteMany({ where: { deviceId } });

      const agent = await tx.agent.findUnique({ where: { deviceId }, select: { id: true } });
      if (agent) {
        await tx.agentPollLog.deleteMany({ where: { agentId: agent.id } });
        await tx.agent.delete({ where: { id: agent.id } });
      }

      await tx.device.delete({ where: { id: deviceId } });
    });
  }

  private toWhere(filter: DeviceListFilter): Prisma.DeviceWhereInput {
    const where: Prisma.DeviceWhereInput = {};
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
    if (filter.managerUserId) {
      where.assignments = { some: { isCurrent: true, managerUserId: filter.managerUserId } };
    }
    if (filter.employeeUserId) {
      where.assignments = { some: { isCurrent: true, employeeUserId: filter.employeeUserId } };
    }
    return where;
  }
}

function toSweepRow(row: {
  id: string;
  clientId: string;
  assetTag: string;
  status: DeviceStatus;
  deletionDueAt: Date | null;
  discardWarningSentAt: Date | null;
  assignments: Array<{ userEmail: string; managerEmail: string }>;
}): SweepDeviceRow {
  const assignment = row.assignments[0];
  return {
    id: row.id,
    clientId: row.clientId,
    assetTag: row.assetTag,
    status: row.status,
    deletionDueAt: row.deletionDueAt,
    discardWarningSentAt: row.discardWarningSentAt,
    userEmail: assignment?.userEmail ?? null,
    managerEmail: assignment?.managerEmail ?? null,
  };
}
