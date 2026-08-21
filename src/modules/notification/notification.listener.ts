import { NotificationType } from "@prisma/client";
import type { DomainEventBus } from "../../shared/kernel/events";
import { createQueue } from "../../shared/kernel/queue";
import type { NotificationRepository } from "./notification.repository";
import type { NotificationJobPayload } from "./notification.schemas";

const DEFAULT_JOB_OPTS = {
  attempts: 5,
};

/**
 * Listens for allotment / storage / discard-warning events and enqueues
 * notification jobs. Never sends email synchronously in the handler.
 */
export class NotificationListener {
  private readonly queue = createQueue<NotificationJobPayload>("notifications");

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly notificationRepository: NotificationRepository,
  ) {
    this.register();
  }

  private register(): void {
    this.eventBus.on("device.allotted", (payload) =>
      void this.enqueue({
        type: NotificationType.DEVICE_ALLOTMENT,
        deviceId: payload.entityId,
        recipients: payload.recipients,
        context: {
          assetTag: payload.assetTag,
          qrValue: payload.qrValue,
          clientId: payload.clientId,
        },
        jobId: `allotment:${payload.entityId}`,
      }).catch(() => {
        /* enqueue failures must not break the request path */
      }),
    );

    this.eventBus.on("device.storage.threshold_breached", (payload) =>
      void this.enqueue({
        type: NotificationType.STORAGE_THRESHOLD,
        deviceId: payload.entityId,
        recipients: payload.recipients,
        context: {
          storageUsedPercent: payload.storageUsedPercent,
          clientId: payload.clientId,
          agentId: payload.agentId,
        },
        jobId: `storage:${payload.entityId}:${utcDayKey(new Date())}`,
      }).catch(() => {
        /* enqueue failures must not break the request path */
      }),
    );

    this.eventBus.on("device.discard.warning", (payload) =>
      void this.enqueue({
        type: NotificationType.DISCARD_WARNING,
        deviceId: payload.entityId,
        recipients: payload.recipients,
        context: {
          assetTag: payload.assetTag,
          deletionDueAt: payload.deletionDueAt,
          clientId: payload.clientId,
        },
        jobId: `discard-warning:${payload.entityId}`,
      }).catch(() => {
        /* enqueue failures must not break the request path */
      }),
    );
  }

  private async enqueue(input: {
    type: NotificationType;
    deviceId: string | null;
    recipients: string[];
    context: Record<string, unknown>;
    jobId: string;
  }): Promise<void> {
    const row = await this.notificationRepository.create({
      deviceId: input.deviceId,
      type: input.type,
      recipients: input.recipients,
    });

    await this.queue.add(
      input.type,
      {
        notificationId: row.id,
        type: input.type,
        deviceId: input.deviceId,
        recipients: input.recipients,
        context: input.context,
      },
      { ...DEFAULT_JOB_OPTS, jobId: input.jobId },
    );
  }
}

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
