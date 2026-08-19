import type { Prisma } from "@prisma/client";
import type { QrRepository } from "./qr.repository";

/**
 * QR generation used by Device allotment (same DB transaction).
 * HTTP render/scan routes remain Prompt 7 — this service is the production
 * write path so allotment never persists a Device without a QrCode.
 */
export class QrService {
  constructor(private readonly qrRepository: QrRepository) {}

  /**
   * Creates the one-per-device QrCode row. `qrValue` is derived from assetTag
   * so the physical label matches inventory identity.
   */
  async generateQrForDevice(
    tx: Prisma.TransactionClient,
    deviceId: string,
    assetTag: string,
  ): Promise<{ id: string; deviceId: string; qrValue: string }> {
    return this.qrRepository.createForDevice(tx, deviceId, `INV:${assetTag}`);
  }
}
