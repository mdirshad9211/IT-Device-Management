import type { LifecycleEventType } from "@prisma/client";
import { NotFoundError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { enforceAccess } from "../../shared/kernel/rbac";
import { AppUserRole } from "@prisma/client";
import { lifecycleEventName, planLifecycleTransition } from "./device.lifecycle";
import type { DeviceRepository } from "./device.repository";
import type { Actor } from "./device.service";

export class DeviceLifecycleService {
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * LLD §4 lifecycle state machine. Handlers live in `LIFECYCLE_HANDLERS`.
   * Device status change and DeviceLifecycleEvent are written in one transaction.
   */
  async transition(deviceId: string, eventType: LifecycleEventType, actor: Actor, now = new Date()) {
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new NotFoundError("Device not found");
    }

    const activeAssignedClientIds =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.deviceRepository.listActiveAssignedClientIds(actor.userId)
        : [];

    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "edit",
      targetClientId: device.clientId,
      activeAssignedClientIds,
      currentAssignment: device.currentAssignment,
    });

    const fromStatus = device.status;
    const plan = planLifecycleTransition(eventType, {
      currentStatus: device.status,
      deletionDueAt: device.deletionDueAt,
      discardedAt: device.discardedAt,
      retiredFlag: device.retiredFlag,
      now,
      actorRole: actor.role,
    });

    const updated = await this.deviceRepository.applyLifecycle(deviceId, plan, eventType, actor.userId);
    this.eventBus.emit(lifecycleEventName(eventType), {
      actorId: actor.userId,
      deviceId,
      fromStatus,
      toStatus: plan.status,
      eventType,
    });
    return updated;
  }
}
