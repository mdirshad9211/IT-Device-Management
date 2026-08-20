import { AuditAction, LifecycleEventType } from "@prisma/client";
import type { Job, Queue, Worker } from "bullmq";
import type { Logger } from "pino";
import type { DomainEventBus } from "../shared/kernel/events";
import { createQueue, createWorker } from "../shared/kernel/queue";
import type { DeviceRepository, SweepDeviceRow } from "../modules/device/device.repository";

/** Days before deletionDueAt at which a discard warning is emitted (once). */
export const DISCARD_WARNING_LEAD_DAYS = 15;

export const LIFECYCLE_SWEEP_QUEUE = "lifecycle-sweep";
export const LIFECYCLE_SWEEP_JOB_NAME = "daily";
export const LIFECYCLE_SWEEP_REPEAT_JOB_ID = "lifecycle-sweep-daily";

/**
 * Daily sweep:
 * 1. Hard-delete DISCARDED devices past deletionDueAt (emit `device.deleted` first).
 * 2. Emit `device.discard.warning` for devices ~15 days out that have not been
 *    warned yet (`Device.discardWarningSentAt` is the idempotency marker).
 *
 * Re-running the same day is safe: deletes only match remaining DISCARDED rows;
 * warnings use claimDiscardWarning (updateMany where discardWarningSentAt null).
 */
export class LifecycleSweepService {
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly eventBus: DomainEventBus,
    private readonly logger: Logger,
  ) {}

  async run(now = new Date()): Promise<{ deleted: number; warned: number }> {
    const deleted = await this.hardDeleteDueDevices(now);
    const warned = await this.warnUpcomingDeletes(now);
    this.logger.info({ deleted, warned }, "lifecycle sweep completed");
    return { deleted, warned };
  }

  private async hardDeleteDueDevices(now: Date): Promise<number> {
    const due = await this.deviceRepository.listDueForHardDelete(now);
    let count = 0;
    for (const device of due) {
      try {
        this.eventBus.emit("device.deleted", {
          entityType: "Device",
          entityId: device.id,
          action: AuditAction.DELETE,
          performedBy: null,
          before: {
            id: device.id,
            clientId: device.clientId,
            assetTag: device.assetTag,
            status: device.status,
            deletionDueAt: device.deletionDueAt,
          },
          after: null,
          fromStatus: device.status,
          toStatus: "DELETED",
          eventType: LifecycleEventType.AUTO_DELETE,
        });
        await this.deviceRepository.hardDeleteDevice(device.id);
        count += 1;
      } catch (error) {
        this.logger.error({ err: error, deviceId: device.id }, "lifecycle sweep hard-delete failed");
      }
    }
    return count;
  }

  private async warnUpcomingDeletes(now: Date): Promise<number> {
    const candidates = await this.deviceRepository.listDueForDiscardWarning(now, DISCARD_WARNING_LEAD_DAYS);
    let count = 0;
    for (const device of candidates) {
      const claimed = await this.deviceRepository.claimDiscardWarning(device.id, now);
      if (!claimed) continue;
      this.emitDiscardWarning(device);
      count += 1;
    }
    return count;
  }

  private emitDiscardWarning(device: SweepDeviceRow): void {
    const recipients = uniqueEmails([device.userEmail, device.managerEmail]);
    this.eventBus.emit("device.discard.warning", {
      entityType: "Device",
      entityId: device.id,
      action: AuditAction.UPDATE,
      performedBy: null,
      before: { discardWarningSentAt: null },
      after: {
        discardWarningSentAt: new Date().toISOString(),
        deletionDueAt: device.deletionDueAt?.toISOString() ?? null,
      },
      clientId: device.clientId,
      assetTag: device.assetTag,
      deletionDueAt: device.deletionDueAt?.toISOString() ?? "",
      recipients,
    });
  }
}

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const email = value?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export type LifecycleSweepHandles = {
  queue: Queue;
  worker: Worker;
};

/**
 * Starts the repeatable daily lifecycle sweep worker and ensures the cron job
 * is registered (idempotent jobId).
 */
export async function startLifecycleSweepJob(deps: {
  lifecycleSweepService: LifecycleSweepService;
  logger: Logger;
}): Promise<LifecycleSweepHandles> {
  const queue = createQueue(LIFECYCLE_SWEEP_QUEUE);
  const worker = createWorker(LIFECYCLE_SWEEP_QUEUE, async (_job: Job) => {
    await deps.lifecycleSweepService.run();
  });

  await queue.add(
    LIFECYCLE_SWEEP_JOB_NAME,
    {},
    {
      repeat: { pattern: "0 3 * * *" }, // 03:00 UTC daily
      jobId: LIFECYCLE_SWEEP_REPEAT_JOB_ID,
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );

  deps.logger.info("lifecycle sweep job scheduled (daily 03:00 UTC)");
  return { queue, worker };
}
