import type { Prisma, PrismaClient, QrCode } from "@prisma/client";
import type { DeviceStatus, PollStatus } from "@prisma/client";

export type QrCodeRecord = Pick<QrCode, "id" | "deviceId" | "qrValue" | "printCount" | "createdAt">;

export type DeviceForQr = {
  id: string;
  clientId: string;
  assetTag: string;
  status: DeviceStatus;
  cpu: string | null;
  ram: string | null;
  storageUsedPercent: number | null;
};

export type AgentPollFreshness = {
  id: string;
  lastPollAt: Date | null;
  lastPollStatus: PollStatus | null;
};

export type QrResolveRecord = {
  qr: QrCodeRecord;
  device: DeviceForQr;
  agent: AgentPollFreshness | null;
};

export type DbClient = Prisma.TransactionClient | PrismaClient;

export interface QrRepository {
  findByDeviceId(deviceId: string, db?: DbClient): Promise<QrCodeRecord | null>;
  findByQrValue(qrValue: string): Promise<QrResolveRecord | null>;
  findDeviceAssetTag(deviceId: string, db?: DbClient): Promise<{ id: string; assetTag: string } | null>;
  findAgentByDeviceId(deviceId: string): Promise<AgentPollFreshness | null>;
  createForDevice(deviceId: string, qrValue: string, db?: DbClient): Promise<QrCodeRecord>;
  incrementPrintCount(deviceId: string): Promise<QrCodeRecord>;
}

export class PrismaQrRepository implements QrRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(client?: DbClient): DbClient {
    return client ?? this.prisma;
  }

  async findByDeviceId(deviceId: string, db?: DbClient): Promise<QrCodeRecord | null> {
    return this.db(db).qrCode.findUnique({
      where: { deviceId },
      select: { id: true, deviceId: true, qrValue: true, printCount: true, createdAt: true },
    });
  }

  async findByQrValue(qrValue: string): Promise<QrResolveRecord | null> {
    const row = await this.prisma.qrCode.findUnique({
      where: { qrValue },
      select: {
        id: true,
        deviceId: true,
        qrValue: true,
        printCount: true,
        createdAt: true,
        device: {
          select: {
            id: true,
            clientId: true,
            assetTag: true,
            status: true,
            cpu: true,
            ram: true,
            storageUsedPercent: true,
            agent: { select: { id: true, lastPollAt: true, lastPollStatus: true } },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    return {
      qr: {
        id: row.id,
        deviceId: row.deviceId,
        qrValue: row.qrValue,
        printCount: row.printCount,
        createdAt: row.createdAt,
      },
      device: {
        id: row.device.id,
        clientId: row.device.clientId,
        assetTag: row.device.assetTag,
        status: row.device.status,
        cpu: row.device.cpu,
        ram: row.device.ram,
        storageUsedPercent: row.device.storageUsedPercent,
      },
      agent: row.device.agent,
    };
  }

  async findDeviceAssetTag(deviceId: string, db?: DbClient): Promise<{ id: string; assetTag: string } | null> {
    return this.db(db).device.findUnique({
      where: { id: deviceId },
      select: { id: true, assetTag: true },
    });
  }

  async findAgentByDeviceId(deviceId: string): Promise<AgentPollFreshness | null> {
    return this.prisma.agent.findUnique({
      where: { deviceId },
      select: { id: true, lastPollAt: true, lastPollStatus: true },
    });
  }

  async createForDevice(deviceId: string, qrValue: string, db?: DbClient): Promise<QrCodeRecord> {
    return this.db(db).qrCode.create({
      data: { deviceId, qrValue },
      select: { id: true, deviceId: true, qrValue: true, printCount: true, createdAt: true },
    });
  }

  async incrementPrintCount(deviceId: string): Promise<QrCodeRecord> {
    return this.prisma.qrCode.update({
      where: { deviceId },
      data: { printCount: { increment: 1 } },
      select: { id: true, deviceId: true, qrValue: true, printCount: true, createdAt: true },
    });
  }
}
