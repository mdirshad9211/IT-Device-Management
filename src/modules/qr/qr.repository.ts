import type { Prisma, PrismaClient, QrCode } from "@prisma/client";

export type QrCodeRecord = Pick<QrCode, "id" | "deviceId" | "qrValue" | "printCount" | "createdAt">;

export interface QrRepository {
  createForDevice(
    tx: Prisma.TransactionClient,
    deviceId: string,
    qrValue: string,
  ): Promise<QrCodeRecord>;
}

export class PrismaQrRepository implements QrRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForDevice(
    tx: Prisma.TransactionClient,
    deviceId: string,
    qrValue: string,
  ): Promise<QrCodeRecord> {
    return tx.qrCode.create({
      data: { deviceId, qrValue },
      select: { id: true, deviceId: true, qrValue: true, printCount: true, createdAt: true },
    });
  }
}
