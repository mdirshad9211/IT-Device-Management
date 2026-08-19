import { describe, expect, it } from "vitest";
import { AppUserRole, DeviceStatus, LifecycleEventType } from "@prisma/client";
import { ConflictError, ForbiddenError } from "../../../src/shared/kernel/errors";
import {
  DISCARD_RETENTION_DAYS,
  LIFECYCLE_HANDLERS,
  planLifecycleTransition,
  type LifecycleHandlerContext,
} from "../../../src/modules/device/device.lifecycle";

const now = new Date("2026-01-15T00:00:00.000Z");

function ctx(overrides: Partial<LifecycleHandlerContext> = {}): LifecycleHandlerContext {
  return {
    currentStatus: DeviceStatus.ACTIVE,
    deletionDueAt: null,
    discardedAt: null,
    retiredFlag: false,
    now,
    actorRole: AppUserRole.SERVICE_MANAGER,
    ...overrides,
  };
}

describe("device lifecycle transition table (LLD §4)", () => {
  it("defines a handler for every LifecycleEventType", () => {
    for (const eventType of Object.values(LifecycleEventType)) {
      expect(typeof LIFECYCLE_HANDLERS[eventType]).toBe("function");
    }
  });

  it("ACTIVE -> DISCARDED sets discardedAt=now and deletionDueAt=+90d", () => {
    const plan = planLifecycleTransition(LifecycleEventType.DISCARD, ctx());
    expect(plan.status).toBe(DeviceStatus.DISCARDED);
    expect(plan.discardedAt).toEqual(now);
    expect(plan.deletionDueAt).toEqual(new Date("2026-04-15T00:00:00.000Z"));
    expect(DISCARD_RETENTION_DAYS).toBe(90);
  });

  it("DISCARDED -> ACTIVE is allowed only when now < deletionDueAt", () => {
    const due = new Date("2026-04-15T00:00:00.000Z");
    const plan = planLifecycleTransition(
      LifecycleEventType.REACTIVATE,
      ctx({ currentStatus: DeviceStatus.DISCARDED, deletionDueAt: due, discardedAt: now }),
    );
    expect(plan.status).toBe(DeviceStatus.ACTIVE);
    expect(plan.discardedAt).toBeNull();
    expect(plan.deletionDueAt).toBeNull();
  });

  it("rejects reactivation on or after deletionDueAt", () => {
    const due = new Date("2026-01-15T00:00:00.000Z");
    expect(() =>
      planLifecycleTransition(
        LifecycleEventType.REACTIVATE,
        ctx({ currentStatus: DeviceStatus.DISCARDED, deletionDueAt: due }),
      ),
    ).toThrow(ConflictError);
  });

  it("DISCARDED -> DELETED is allowed for SUPER_ADMIN and DGN_IT_MANAGER", () => {
    for (const role of [AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER]) {
      const plan = planLifecycleTransition(
        LifecycleEventType.MANUAL_DELETE,
        ctx({ currentStatus: DeviceStatus.DISCARDED, actorRole: role }),
      );
      expect(plan.status).toBe(DeviceStatus.DELETED);
    }
  });

  it("rejects SERVICE_MANAGER permanent delete with ForbiddenError (403)", () => {
    expect(() =>
      planLifecycleTransition(
        LifecycleEventType.MANUAL_DELETE,
        ctx({ currentStatus: DeviceStatus.DISCARDED, actorRole: AppUserRole.SERVICE_MANAGER }),
      ),
    ).toThrow(ForbiddenError);
  });

  it("ACTIVE -> RETIRED / SCRAPPED are terminal with no deletionDueAt", () => {
    const retired = planLifecycleTransition(LifecycleEventType.RETIRE, ctx());
    expect(retired.status).toBe(DeviceStatus.RETIRED);
    expect(retired.deletionDueAt).toBeNull();
    expect(retired.retiredFlag).toBe(true);

    const scrapped = planLifecycleTransition(LifecycleEventType.SCRAP, ctx());
    expect(scrapped.status).toBe(DeviceStatus.SCRAPPED);
    expect(scrapped.deletionDueAt).toBeNull();
  });

  it("rejects every other transition with ConflictError", () => {
    expect(() =>
      planLifecycleTransition(LifecycleEventType.DISCARD, ctx({ currentStatus: DeviceStatus.DISCARDED })),
    ).toThrow(ConflictError);
    expect(() =>
      planLifecycleTransition(LifecycleEventType.RETIRE, ctx({ currentStatus: DeviceStatus.DISCARDED })),
    ).toThrow(ConflictError);
    expect(() =>
      planLifecycleTransition(LifecycleEventType.SCRAP, ctx({ currentStatus: DeviceStatus.RETIRED })),
    ).toThrow(ConflictError);
    expect(() =>
      planLifecycleTransition(LifecycleEventType.REACTIVATE, ctx({ currentStatus: DeviceStatus.ACTIVE })),
    ).toThrow(ConflictError);
    expect(() => planLifecycleTransition(LifecycleEventType.AUTO_DELETE, ctx())).toThrow(ConflictError);
    expect(() => planLifecycleTransition(LifecycleEventType.LOCATION_CHANGE, ctx())).toThrow(ConflictError);
  });
});
