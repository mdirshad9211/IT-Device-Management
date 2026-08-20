import { AppUserRole, DeviceStatus, LifecycleEventType } from "@prisma/client";
import { ConflictError, ForbiddenError } from "../../shared/kernel/errors";

export const DISCARD_RETENTION_DAYS = 90;

export type LifecyclePlan = {
  status: DeviceStatus;
  discardedAt: Date | null;
  deletionDueAt: Date | null;
  retiredFlag: boolean;
  /** Cleared on REACTIVATE so a later discard can warn again. */
  discardWarningSentAt?: Date | null;
};

export type LifecycleHandlerContext = {
  currentStatus: DeviceStatus;
  deletionDueAt: Date | null;
  discardedAt: Date | null;
  retiredFlag: boolean;
  now: Date;
  actorRole: AppUserRole;
};

type LifecycleHandler = (ctx: LifecycleHandlerContext) => LifecyclePlan;

function addDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function requireStatus(ctx: LifecycleHandlerContext, expected: DeviceStatus, eventType: LifecycleEventType): void {
  if (ctx.currentStatus !== expected) {
    throw new ConflictError(`Cannot apply ${eventType} while device status is ${ctx.currentStatus}`);
  }
}

const discard: LifecycleHandler = (ctx) => {
  requireStatus(ctx, DeviceStatus.ACTIVE, LifecycleEventType.DISCARD);
  return {
    status: DeviceStatus.DISCARDED,
    discardedAt: ctx.now,
    deletionDueAt: addDays(ctx.now, DISCARD_RETENTION_DAYS),
    retiredFlag: false,
  };
};

const reactivate: LifecycleHandler = (ctx) => {
  requireStatus(ctx, DeviceStatus.DISCARDED, LifecycleEventType.REACTIVATE);
  if (!ctx.deletionDueAt || ctx.now >= ctx.deletionDueAt) {
    throw new ConflictError("Device cannot be reactivated on or after the 90-day deletion due date");
  }
  return {
    status: DeviceStatus.ACTIVE,
    discardedAt: null,
    deletionDueAt: null,
    retiredFlag: false,
    discardWarningSentAt: null,
  };
};

const manualDelete: LifecycleHandler = (ctx) => {
  requireStatus(ctx, DeviceStatus.DISCARDED, LifecycleEventType.MANUAL_DELETE);
  if (ctx.actorRole !== AppUserRole.SUPER_ADMIN && ctx.actorRole !== AppUserRole.DGN_IT_MANAGER) {
    throw new ForbiddenError("Permanent delete is restricted to SUPER_ADMIN and DGN_IT_MANAGER");
  }
  return {
    status: DeviceStatus.DELETED,
    discardedAt: ctx.discardedAt,
    deletionDueAt: ctx.deletionDueAt,
    retiredFlag: false,
  };
};

const retire: LifecycleHandler = (ctx) => {
  requireStatus(ctx, DeviceStatus.ACTIVE, LifecycleEventType.RETIRE);
  return {
    status: DeviceStatus.RETIRED,
    discardedAt: null,
    deletionDueAt: null,
    retiredFlag: true,
  };
};

const scrap: LifecycleHandler = (ctx) => {
  requireStatus(ctx, DeviceStatus.ACTIVE, LifecycleEventType.SCRAP);
  return {
    status: DeviceStatus.SCRAPPED,
    discardedAt: null,
    deletionDueAt: null,
    retiredFlag: false,
  };
};

const rejectUnsupported = (eventType: LifecycleEventType): LifecycleHandler => {
  return () => {
    throw new ConflictError(`${eventType} is not a user-initiated device lifecycle transition`);
  };
};

/**
 * LLD §4 strategy map — one handler per enum value. Illegal transitions throw
 * ConflictError; MANUAL_DELETE role denial throws ForbiddenError (403).
 */
export const LIFECYCLE_HANDLERS: Record<LifecycleEventType, LifecycleHandler> = {
  [LifecycleEventType.DISCARD]: discard,
  [LifecycleEventType.REACTIVATE]: reactivate,
  [LifecycleEventType.MANUAL_DELETE]: manualDelete,
  [LifecycleEventType.RETIRE]: retire,
  [LifecycleEventType.SCRAP]: scrap,
  [LifecycleEventType.AUTO_DELETE]: rejectUnsupported(LifecycleEventType.AUTO_DELETE),
  [LifecycleEventType.LOCATION_CHANGE]: rejectUnsupported(LifecycleEventType.LOCATION_CHANGE),
};

export function planLifecycleTransition(
  eventType: LifecycleEventType,
  ctx: LifecycleHandlerContext,
): LifecyclePlan {
  return LIFECYCLE_HANDLERS[eventType](ctx);
}

export function lifecycleEventName(
  eventType: LifecycleEventType,
): "device.discarded" | "device.reactivated" | "device.deleted" | "device.retired" | "device.scrapped" {
  switch (eventType) {
    case LifecycleEventType.DISCARD:
      return "device.discarded";
    case LifecycleEventType.REACTIVATE:
      return "device.reactivated";
    case LifecycleEventType.MANUAL_DELETE:
      return "device.deleted";
    case LifecycleEventType.RETIRE:
      return "device.retired";
    case LifecycleEventType.SCRAP:
      return "device.scrapped";
    default:
      throw new ConflictError(`${eventType} does not emit a device lifecycle domain event`);
  }
}
