import QRCode from "qrcode";
import { AuditAction, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { env } from "../../config/env";
import type { DbClient, QrRepository } from "./qr.repository";
import type { QrImageFormat } from "./qr.schemas";

export class QrService {
  constructor(
    private readonly qrRepository: QrRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * SRS §3.3 — create the one-per-device QrCode. Called only from Device
   * allotment (same Prisma transaction when `tx` is passed). Idempotent-safe:
   * throws ConflictError if a row already exists (DB @unique is the backstop).
   */
  async generateQrForDevice(deviceId: string, tx?: DbClient) {
    const existing = await this.qrRepository.findByDeviceId(deviceId, tx);
    if (existing) {
      throw new ConflictError("A QR code already exists for this device");
    }

    const device = await this.qrRepository.findDeviceAssetTag(deviceId, tx);
    if (!device) {
      throw new NotFoundError("Device not found");
    }

    try {
      const qr = await this.qrRepository.createForDevice(deviceId, `INV:${device.assetTag}`, tx);
      this.eventBus.emit("qr.generated", {
        entityType: "QrCode",
        entityId: qr.id,
        action: AuditAction.CREATE,
        performedBy: null,
        before: null,
        after: { deviceId, qrValue: qr.qrValue },
        qrValue: qr.qrValue,
      });
      return qr;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A QR code already exists for this device");
      }
      throw error;
    }
  }

  /**
   * Renders the existing qrValue as PNG or SVG. Never regenerates qrValue.
   * Increments printCount (SRS §3.3 print tracking).
   */
  async renderImage(deviceId: string, format: QrImageFormat): Promise<{ body: Buffer | string; contentType: string }> {
    const qr = await this.qrRepository.findByDeviceId(deviceId);
    if (!qr) {
      throw new NotFoundError("QR code not found for this device");
    }

    const updated = await this.qrRepository.incrementPrintCount(deviceId);
    this.eventBus.emit("qr.printed", {
      entityType: "QrCode",
      entityId: updated.id,
      action: AuditAction.UPDATE,
      performedBy: null,
      before: { printCount: updated.printCount - 1 },
      after: { printCount: updated.printCount },
      qrValue: updated.qrValue,
      printCount: updated.printCount,
    });

    if (format === "svg") {
      const svg = await QRCode.toString(updated.qrValue, { type: "svg", margin: 1 });
      return { body: svg, contentType: "image/svg+xml" };
    }

    const png = await QRCode.toBuffer(updated.qrValue, { type: "png", margin: 1, width: 512 });
    return { body: png, contentType: "image/png" };
  }

  /**
   * Looks up Device by qrValue. Returns a distinct `stale_warning` payload when
   * the QR is unknown or the linked Agent's lastPollAt is beyond the configured
   * threshold (for the frontend stale-warning pop-up).
   */
  async resolve(qrValue: string, now = new Date()) {
    const thresholdMs = env.QR_STALE_POLL_THRESHOLD_MS;
    const found = await this.qrRepository.findByQrValue(qrValue);

    if (!found) {
      return {
        status: "stale_warning" as const,
        stale: true as const,
        reason: "QR_NOT_FOUND" as const,
        message: "No device is linked to this QR value",
        qrValue,
        device: null,
        agent: null,
      };
    }

    if (!found.agent) {
      return {
        status: "stale_warning" as const,
        stale: true as const,
        reason: "AGENT_MISSING" as const,
        message: "This device has no registered agent; telemetry may be unavailable",
        qrValue,
        device: {
          id: found.device.id,
          clientId: found.device.clientId,
          assetTag: found.device.assetTag,
          status: found.device.status,
        },
        agent: null,
      };
    }

    const lastPollAt = found.agent.lastPollAt;
    const isStale = !lastPollAt || now.getTime() - lastPollAt.getTime() > thresholdMs;
    if (isStale) {
      return {
        status: "stale_warning" as const,
        stale: true as const,
        reason: "AGENT_POLL_STALE" as const,
        message: "Agent telemetry is stale; trigger an on-demand poll or check connectivity",
        qrValue,
        device: {
          id: found.device.id,
          clientId: found.device.clientId,
          assetTag: found.device.assetTag,
          status: found.device.status,
        },
        agent: {
          id: found.agent.id,
          lastPollAt: found.agent.lastPollAt,
          lastPollStatus: found.agent.lastPollStatus,
          staleThresholdMs: thresholdMs,
        },
      };
    }

    return {
      status: "ok" as const,
      stale: false as const,
      qrValue,
      device: found.device,
      agent: found.agent,
    };
  }

  /**
   * Requests an on-demand agent poll for the device (SRS §3.3). Emits
   * `agent.poll.requested` for Agent/Notification listeners — does not invent
   * telemetry here.
   */
  async requestOnDemandPoll(deviceId: string, actorUserId: string) {
    const qr = await this.qrRepository.findByDeviceId(deviceId);
    if (!qr) {
      throw new NotFoundError("QR code not found for this device");
    }

    const agent = await this.qrRepository.findAgentByDeviceId(deviceId);
    if (!agent) {
      throw new NotFoundError("No agent is registered for this device");
    }

    const requestedAt = new Date();
    this.eventBus.emit("agent.poll.requested", {
      entityType: "Agent",
      entityId: agent.id,
      action: AuditAction.UPDATE,
      performedBy: actorUserId,
      before: null,
      after: { deviceId, requestedAt: requestedAt.toISOString(), source: "qr" },
      agentId: agent.id,
      source: "qr",
      requestedAt: requestedAt.toISOString(),
    });

    return {
      deviceId,
      agentId: agent.id,
      requested: true as const,
      requestedAt: requestedAt.toISOString(),
    };
  }
}
